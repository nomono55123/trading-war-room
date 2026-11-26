import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import type { Bar, IndicatorOutput } from './indicatorEngine';

export type DrawingToolType = 'cursor' | 'trendline' | 'hline' | 'rect' | 'fibo' | 'long' | 'short' | 'frvp' | 'path' | 'text';

export interface FiboLevel {
  enabled: boolean;
  value: number;
  color: string;
}

export interface PositionConfig {
  accountSize: number;
  riskMode: 'percent' | 'amount';
  riskValue: number;
  leverage: number;
}

export interface FrvpConfig {
  rows: number;
  volumeMode: 'up_down' | 'total';
  vaPercent: number;
  extendRight: boolean;
}

export interface DrawingItem {
  id: string;
  type: Exclude<DrawingToolType, 'cursor'>;
  symbol: string;
  locked?: boolean;
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  p3?: number;
  points?: { time: number; price: number }[];
  arrowEnd?: boolean;
  text?: string;
  fontSize?: number;
  bgColor?: string;
  color: string;
  fillColor?: string;
  lineWidth: number;
  dashed?: boolean;
  extendRight?: boolean;
  fiboLevels?: FiboLevel[];
  posConfig?: PositionConfig;
  frvpConfig?: FrvpConfig;
}

export const DEFAULT_FIBO_LEVELS: FiboLevel[] = [
  { enabled: true, value: -0.29, color: '#ef5350' },
  { enabled: true, value: -0.21, color: '#ff9800' },
  { enabled: true, value: 0, color: '#787b86' },
  { enabled: false, value: 0.109, color: '#787b86' },
  { enabled: false, value: 0.127, color: '#787b86' },
  { enabled: false, value: 0.145, color: '#787b86' },
  { enabled: false, value: 0.214, color: '#787b86' },
  { enabled: false, value: 0.232, color: '#787b86' },
  { enabled: false, value: 0.25, color: '#787b86' },
  { enabled: false, value: 0.382, color: '#4caf50' },
  { enabled: true, value: 0.5, color: '#4caf50' },
  { enabled: true, value: 0.618, color: '#089981' },
  { enabled: true, value: 0.705, color: '#2962ff' },
  { enabled: true, value: 0.79, color: '#2962ff' },
  { enabled: true, value: 1, color: '#787b86' },
  { enabled: false, value: 1.272, color: '#9c27b0' },
  { enabled: false, value: 1.414, color: '#9c27b0' },
  { enabled: false, value: 1.54, color: '#9c27b0' },
  { enabled: false, value: 1.618, color: '#e91e63' },
  { enabled: false, value: 2, color: '#787b86' },
  { enabled: false, value: 2.272, color: '#787b86' },
  { enabled: false, value: 2.414, color: '#787b86' },
  { enabled: false, value: 2.618, color: '#787b86' },
  { enabled: false, value: 3.618, color: '#787b86' },
];

export const DEFAULT_POS_CONFIG: PositionConfig = {
  accountSize: 2000,
  riskMode: 'percent',
  riskValue: 1.0,
  leverage: 20,
};

export const DEFAULT_FRVP_CONFIG: FrvpConfig = {
  rows: 200,
  volumeMode: 'up_down',
  vaPercent: 70,
  extendRight: false,
};

export function calcPositionMetrics(d: DrawingItem) {
  const cfg = d.posConfig || DEFAULT_POS_CONFIG;
  const entry = d.p1;
  const sl = d.p2;
  const tp = d.p3 ?? (d.type === 'long' ? entry * 1.02 : entry * 0.98);
  const riskPerUnit = Math.abs(entry - sl);
  const rewardPerUnit = Math.abs(tp - entry);
  const rr = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
  const riskUsd = cfg.riskMode === 'percent' ? (cfg.accountSize * cfg.riskValue) / 100 : cfg.riskValue;
  const qty = riskPerUnit > 0 ? riskUsd / riskPerUnit : 0;
  const notionalUsd = qty * entry;
  const marginUsd = cfg.leverage > 0 ? notionalUsd / cfg.leverage : notionalUsd;
  const profitUsd = qty * rewardPerUnit;
  return { entry, sl, tp, rr, riskUsd, qty, notionalUsd, marginUsd, profitUsd };
}

interface Props {
  bars: Bar[];
  outputs: IndicatorOutput[];
  symbol: string;
  activeTool: DrawingToolType;
  magnetEnabled: boolean;
  replaySelecting: boolean;
  onSelectReplayTime: (time: number) => void;
  drawings: DrawingItem[];
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  onAddDrawing: (d: DrawingItem) => void;
  onUpdateDrawing: (d: DrawingItem) => void;
  onDoubleClickDrawing: (d: DrawingItem) => void;
  onFinishTool: () => void;
  defaultFiboLevels: FiboLevel[];
  defaultPosConfig: PositionConfig;
  defaultFrvpConfig: FrvpConfig;
  onLoadMoreHistory?: () => void;
  externalChartRef?: React.RefObject<IChartApi | null>;
  externalCandleSeriesRef?: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const ChartCanvas: React.FC<Props> = ({
  bars, outputs, symbol, activeTool, magnetEnabled, replaySelecting, onSelectReplayTime,
  drawings, selectedDrawingId, onSelectDrawing, onAddDrawing, onUpdateDrawing, onDoubleClickDrawing, onFinishTool,
  defaultFiboLevels, defaultPosConfig, defaultFrvpConfig, onLoadMoreHistory, externalChartRef, externalCandleSeriesRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesListRef = useRef<ISeriesApi<'Line'>[]>([]);
  const lastSymbolRef = useRef<string>(symbol);

  const [draftDrawing, setDraftDrawing] = useState<DrawingItem | null>(null);
  const [cursorPt, setCursorPt] = useState<{ time: number; price: number } | null>(null);
  const [hoverReplayX, setHoverReplayX] = useState<number | null>(null);

  const syncCrosshairToPoint = (
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    time: number,
    price: number
  ) => {
    try {
      const c = chart as any;
      if (typeof c.setCrosshairPosition === "function") {
        c.setCrosshairPosition(price, time as any, series);
      }
    } catch {}
  };

  const clearSyncedCrosshair = (chart: IChartApi | null) => {
    try {
      const c = chart as any;
      if (c && typeof c.clearCrosshairPosition === "function") {
        c.clearCrosshairPosition();
      }
    } catch {}
  };

  const dragStateRef = useRef<{
    id: string;
    handle: 'p1' | 'p2' | 'p3' | 'move' | number;
    startX: number;
    startY: number;
    orig: DrawingItem;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      crosshair: { mode: 0 },
      timeScale: { borderColor: '#2a2e39', timeVisible: true, rightOffset: 25 },
      rightPriceScale: { borderColor: '#2a2e39', autoScale: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    if (externalChartRef) externalChartRef.current = chart;
    if (externalCandleSeriesRef) externalCandleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, []);

  const prevRenderedBarsRef = useRef<typeof bars>([]);
  const isUserDraggingRef = useRef<boolean>(false);
  const drawOverlayFnRef = useRef<(() => void) | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const onLoadMoreRef = useRef(onLoadMoreHistory);
  onLoadMoreRef.current = onLoadMoreHistory;

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;

    const scheduleDraw = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        drawOverlayFnRef.current?.();
      });
    };

    const handleRangeChange = (logicalRange: { from: number; to: number } | null) => {
      scheduleDraw();
      if (!logicalRange) return;
      if (logicalRange.from < -5 && !isUserDraggingRef.current) {
        const span = Math.max(10, logicalRange.to - logicalRange.from);
        chart.timeScale().setVisibleLogicalRange({ from: -5, to: -5 + span });
      }
      if (logicalRange.from < 300 && onLoadMoreRef.current) {
        onLoadMoreRef.current();
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    chart.timeScale().subscribeSizeChange(scheduleDraw);
    el.addEventListener('wheel', scheduleDraw, { passive: true });
    el.addEventListener('mousemove', scheduleDraw, { passive: true });

    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.timeScale().unsubscribeSizeChange(scheduleDraw);
      el.removeEventListener('wheel', scheduleDraw);
      el.removeEventListener('mousemove', scheduleDraw);
    };
  }, []);
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    if (bars.length === 0) {
      prevRenderedBarsRef.current = [];
      candleSeriesRef.current.setData([]);
      return;
    }

    const prev = prevRenderedBarsRef.current;
    const isSameSymbol = lastSymbolRef.current === symbol;
    const lastBar = bars[bars.length - 1];
    const prevLast = prev.length > 0 ? prev[prev.length - 1] : null;

    // 只要同商品且時間往前推進或即時更新，100% 走 update() 增量渲染，絕不觸發 setData() 清空黑幀
    if (isSameSymbol && prevLast !== null && lastBar.time >= prevLast.time && Math.abs(bars.length - prev.length) <= 5) {
      candleSeriesRef.current.update(lastBar as any);
      prevRenderedBarsRef.current = bars;
      return;
    }

    const lastPrice = lastBar.close;
    let precision = 2, minMove = 0.01;
    if (lastPrice < 0.01) { precision = 6; minMove = 0.000001; }
    else if (lastPrice < 1) { precision = 5; minMove = 0.00001; }
    else if (lastPrice < 100) { precision = 4; minMove = 0.0001; }

    candleSeriesRef.current.applyOptions({ priceFormat: { type: "price", precision, minMove } });
    candleSeriesRef.current.setData(bars as any);
    prevRenderedBarsRef.current = bars;
    lastSymbolRef.current = symbol;
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current.timeScale().scrollToRealTime();
  }, [bars, symbol]);

  useEffect(() => {
    if (activeTool === 'cursor') {
      setDraftDrawing(null);
      setCursorPt(null);
    }
  }, [activeTool]);

  const getCoordsHelper = () => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries || bars.length === 0) return null;
    const timeScale = chart.timeScale();
    const firstBar = bars[0];
    const lastBar = bars[bars.length - 1];
    const barStep = bars.length > 1 ? bars[1].time - bars[0].time : 900;

    const getPxPerBar = (): number => {
      if (bars.length < 2) return 8;
      const xA = timeScale.timeToCoordinate(bars[bars.length - 2].time as any);
      const xB = timeScale.timeToCoordinate(bars[bars.length - 1].time as any);
      if (xA !== null && xB !== null && xB > xA) return xB - xA;
      return 8;
    };

    const timeToX = (t: number): number | null => {
      const pxPerBar = getPxPerBar();
      if (t <= lastBar.time && t >= firstBar.time) {
        let closest = bars[0].time;
        let minDiff = Math.abs(t - closest);
        for (let i = 1; i < bars.length; i++) {
          const diff = Math.abs(t - bars[i].time);
          if (diff < minDiff) { minDiff = diff; closest = bars[i].time; }
        }
        const coord = timeScale.timeToCoordinate(closest as any);
        if (coord !== null) return coord;
        const lastX = timeScale.timeToCoordinate(lastBar.time as any);
        if (lastX !== null) return lastX - ((lastBar.time - closest) / barStep) * pxPerBar;
        return null;
      } else if (t > lastBar.time) {
        const lastX = timeScale.timeToCoordinate(lastBar.time as any);
        if (lastX === null) return null;
        return lastX + ((t - lastBar.time) / barStep) * pxPerBar;
      } else {
        const firstX = timeScale.timeToCoordinate(firstBar.time as any);
        if (firstX !== null) return firstX - ((firstBar.time - t) / barStep) * pxPerBar;
        const lastX = timeScale.timeToCoordinate(lastBar.time as any);
        if (lastX !== null) return lastX - ((lastBar.time - t) / barStep) * pxPerBar;
        return -200;
      }
    };

    const xToTime = (x: number): number => {
      const t = timeScale.coordinateToTime(x);
      if (t !== null) return Number(t);
      const lastX = timeScale.timeToCoordinate(lastBar.time as any) ?? 0;
      const pxPerBar = getPxPerBar();
      return Math.round(lastBar.time + ((x - lastX) / pxPerBar) * barStep);
    };

    const pointToTimePrice = (x: number, y: number, useMagnet: boolean): { time: number; price: number } => {
      const t = xToTime(x);
      let price = candleSeries.coordinateToPrice(y) ?? lastBar.close;
      if (useMagnet) {
        let closestBar = bars[0];
        let minTDiff = Math.abs(t - closestBar.time);
        for (const b of bars) {
          const d = Math.abs(t - b.time);
          if (d < minTDiff) { minTDiff = d; closestBar = b; }
        }
        const candidates = [
          { p: closestBar.high, yCoord: candleSeries.priceToCoordinate(closestBar.high) },
          { p: closestBar.low, yCoord: candleSeries.priceToCoordinate(closestBar.low) },
          { p: closestBar.open, yCoord: candleSeries.priceToCoordinate(closestBar.open) },
          { p: closestBar.close, yCoord: candleSeries.priceToCoordinate(closestBar.close) },
        ];
        let minPy = 22;
        for (const c of candidates) {
          if (c.yCoord !== null && Math.abs(c.yCoord - y) < minPy) {
            minPy = Math.abs(c.yCoord - y);
            price = c.p;
          }
        }
      }
      return { time: t, price };
    };

    return { chart, candleSeries, timeToX, xToTime, pointToTimePrice, barStep, lastBar };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const helper = getCoordsHelper();
    if (!rect || !helper) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 若處於 K 線回放選點模式，點擊直接切斷該時間點
    if (replaySelecting) {
      const cutTime = helper.xToTime(x);
      setHoverReplayX(null);
      onSelectReplayTime(cutTime);
      return;
    }

    if (activeTool !== 'cursor') {
      const pt = helper.pointToTimePrice(x, y, magnetEnabled);

      // 文字標註工具
      if (activeTool === 'text') {
        const inputStr = prompt('請輸入標註文字（例如：BSL、FVG、流動性獵殺）：', 'BSL');
        if (inputStr && inputStr.trim()) {
          const newItem: DrawingItem = {
            id: `drw_${Date.now()}`, type: 'text', symbol, locked: false,
            t1: pt.time, p1: pt.price, t2: pt.time, p2: pt.price,
            text: inputStr.trim(), fontSize: 13, color: '#ffffff', bgColor: 'rgba(30, 34, 45, 0.88)',
            lineWidth: 1,
          };
          onAddDrawing(newItem);
          onSelectDrawing(newItem.id);
        }
        onFinishTool();
        return;
      }

      if (activeTool === 'path') {
        if (e.button === 2) {
          if (draftDrawing && (draftDrawing.points?.length || 0) >= 2) {
            onAddDrawing(draftDrawing);
            onSelectDrawing(draftDrawing.id);
          }
          setDraftDrawing(null);
          setCursorPt(null);
          onFinishTool();
          return;
        }
        if (!draftDrawing) {
          setDraftDrawing({
            id: `drw_${Date.now()}`, type: 'path', symbol, locked: false,
            t1: pt.time, p1: pt.price, t2: pt.time, p2: pt.price,
            points: [pt], arrowEnd: true, color: '#facc15', lineWidth: 2,
          });
        } else {
          const nextPts = [...(draftDrawing.points || []), pt];
          setDraftDrawing({ ...draftDrawing, points: nextPts, t2: pt.time, p2: pt.price });
        }
        return;
      }

      if (activeTool === 'hline') {
        onAddDrawing({
          id: `drw_${Date.now()}`, type: 'hline', symbol, locked: false,
          t1: pt.time, p1: pt.price, t2: pt.time + helper.barStep * 20, p2: pt.price,
          color: '#2962ff', lineWidth: 2, extendRight: true,
        });
        onFinishTool();
        return;
      }

      if (activeTool === 'long' || activeTool === 'short') {
        const span = Math.abs(helper.lastBar.high - helper.lastBar.low) * 1.5 || pt.price * 0.01;
        const sl = activeTool === 'long' ? pt.price - span : pt.price + span;
        const tp = activeTool === 'long' ? pt.price + span * 2 : pt.price - span * 2;
        const newItem: DrawingItem = {
          id: `drw_${Date.now()}`, type: activeTool, symbol, locked: false,
          t1: pt.time, p1: pt.price, t2: pt.time + helper.barStep * 16, p2: sl, p3: tp,
          color: activeTool === 'long' ? '#089981' : '#f23645', lineWidth: 1,
          posConfig: { ...defaultPosConfig },
        };
        onAddDrawing(newItem);
        onSelectDrawing(newItem.id);
        onFinishTool();
        return;
      }

      if (!draftDrawing) {
        setDraftDrawing({
          id: `drw_${Date.now()}`,
          type: activeTool,
          symbol,
          locked: false,
          t1: pt.time, p1: pt.price, t2: pt.time, p2: pt.price,
          color: activeTool === 'rect' ? '#2962ff' : '#787b86',
          fillColor: activeTool === 'rect' ? 'rgba(41, 98, 255, 0.16)' : undefined,
          lineWidth: 2,
          fiboLevels: activeTool === 'fibo' ? JSON.parse(JSON.stringify(defaultFiboLevels)) : undefined,
          frvpConfig: activeTool === 'frvp' ? { ...defaultFrvpConfig } : undefined,
        });
      } else {
        const finished = { ...draftDrawing, t2: pt.time, p2: pt.price };
        setDraftDrawing(null);
        onAddDrawing(finished);
        onSelectDrawing(finished.id);
        onFinishTool();
      }
      return;
    }

    const symDrawings = drawings.filter((d) => d.symbol === symbol);
    if (selectedDrawingId) {
      const sel = symDrawings.find((d) => d.id === selectedDrawingId);
      if (sel && !sel.locked) {
        if (sel.type === 'path' && sel.points) {
          for (let idx = 0; idx < sel.points.length; idx++) {
            const px = helper.timeToX(sel.points[idx].time);
            const py = helper.candleSeries.priceToCoordinate(sel.points[idx].price);
            if (px !== null && py !== null && Math.hypot(x - px, y - py) < 12) {
              dragStateRef.current = { id: sel.id, handle: idx, startX: x, startY: y, orig: JSON.parse(JSON.stringify(sel)) };
              helper.chart.applyOptions({ handleScroll: false, handleScale: false });
              return;
            }
          }
        } else if (sel.type !== 'text') {
          const x1 = helper.timeToX(sel.t1);
          const y1 = helper.candleSeries.priceToCoordinate(sel.p1);
          const x2 = helper.timeToX(sel.t2);
          const y2 = helper.candleSeries.priceToCoordinate(sel.p2);
          const y3 = sel.p3 !== undefined ? helper.candleSeries.priceToCoordinate(sel.p3) : null;

          if (x1 !== null && y1 !== null && Math.hypot(x - x1, y - y1) < 12) {
            dragStateRef.current = { id: sel.id, handle: 'p1', startX: x, startY: y, orig: { ...sel } };
            helper.chart.applyOptions({ handleScroll: false, handleScale: false });
            return;
          }
          if (x2 !== null && y2 !== null && Math.hypot(x - x2, y - y2) < 12) {
            dragStateRef.current = { id: sel.id, handle: 'p2', startX: x, startY: y, orig: { ...sel } };
            helper.chart.applyOptions({ handleScroll: false, handleScale: false });
            return;
          }
          if (x2 !== null && y3 !== null && Math.hypot(x - x2, y - y3) < 12) {
            dragStateRef.current = { id: sel.id, handle: 'p3', startX: x, startY: y, orig: { ...sel } };
            helper.chart.applyOptions({ handleScroll: false, handleScale: false });
            return;
          }
        }
      }
    }

    for (let i = symDrawings.length - 1; i >= 0; i--) {
      const d = symDrawings[i];
      let hit = false;

      if (d.type === 'path' && d.points && d.points.length >= 2) {
        for (let k = 1; k < d.points.length; k++) {
          const px1 = helper.timeToX(d.points[k - 1].time);
          const py1 = helper.candleSeries.priceToCoordinate(d.points[k - 1].price);
          const px2 = helper.timeToX(d.points[k].time);
          const py2 = helper.candleSeries.priceToCoordinate(d.points[k].price);
          if (px1 === null || py1 === null || px2 === null || py2 === null) continue;
          const len2 = (px2 - px1) ** 2 + (py2 - py1) ** 2;
          if (len2 > 0) {
            const proj = Math.max(0, Math.min(1, ((x - px1) * (px2 - px1) + (y - py1) * (py2 - py1)) / len2));
            if (Math.hypot(x - (px1 + proj * (px2 - px1)), y - (py1 + proj * (py2 - py1))) < 9) { hit = true; break; }
          }
        }
      } else {
        const x1 = helper.timeToX(d.t1);
        const y1 = helper.candleSeries.priceToCoordinate(d.p1);
        const x2 = helper.timeToX(d.t2);
        const y2 = helper.candleSeries.priceToCoordinate(d.p2);
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        if (d.type === 'text') {
          const boxW = (d.text?.length || 2) * (d.fontSize || 13) + 16;
          const boxH = (d.fontSize || 13) + 12;
          hit = x >= x1 - 4 && x <= x1 + boxW && y >= y1 - boxH && y <= y1 + 4;
        } else if (d.type === 'hline') {
          hit = Math.abs(y - y1) < 8;
        } else if (d.type === 'rect' || d.type === 'fibo') {
          hit = x >= Math.min(x1, x2) - 6 && x <= Math.max(x1, x2) + 6 && y >= Math.min(y1, y2) - 6 && y <= Math.max(y1, y2) + 6;
        } else if (d.type === 'frvp') {
          const minT = Math.min(d.t1, d.t2);
          const maxT = Math.max(d.t1, d.t2);
          const rangeBars = bars.filter((b) => b.time >= minT && b.time <= maxT);
          const hi = rangeBars.length > 0 ? Math.max(...rangeBars.map((b) => b.high)) : Math.max(d.p1, d.p2);
          const lo = rangeBars.length > 0 ? Math.min(...rangeBars.map((b) => b.low)) : Math.min(d.p1, d.p2);
          const yHi = helper.candleSeries.priceToCoordinate(hi) ?? Math.min(y1, y2);
          const yLo = helper.candleSeries.priceToCoordinate(lo) ?? Math.max(y1, y2);
          hit = x >= Math.min(x1, x2) - 6 && x <= Math.max(x1, x2) + 6 && y >= yHi - 6 && y <= yLo + 6;
        } else if (d.type === 'long' || d.type === 'short') {
          const y3 = d.p3 !== undefined ? helper.candleSeries.priceToCoordinate(d.p3) ?? y1 : y1;
          hit = x >= Math.min(x1, x2) - 6 && x <= Math.max(x1, x2) + 6 && y >= Math.min(y1, y2, y3) - 6 && y <= Math.max(y1, y2, y3) + 6;
        } else if (d.type === 'trendline') {
          const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
          if (len2 > 0) {
            const tProj = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / len2));
            hit = Math.hypot(x - (x1 + tProj * (x2 - x1)), y - (y1 + tProj * (y2 - y1))) < 8;
          }
        }
      }

      if (hit) {
        onSelectDrawing(d.id);
        if (!d.locked) {
          dragStateRef.current = { id: d.id, handle: 'move', startX: x, startY: y, orig: JSON.parse(JSON.stringify(d)) };
          helper.chart.applyOptions({ handleScroll: false, handleScale: false });
        }
        return;
      }
    }

    onSelectDrawing(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const helper = getCoordsHelper();
    if (!rect || !helper) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (replaySelecting) {
      setHoverReplayX(x);
      return;
    }

    if (draftDrawing) {
      const pt = helper.pointToTimePrice(x, y, magnetEnabled);
      if (draftDrawing.type === 'path') setCursorPt(pt);
      else setDraftDrawing({ ...draftDrawing, t2: pt.time, p2: pt.price });
      return;
    }

    const drag = dragStateRef.current;
    if (drag && !drag.orig.locked) {
      const pt = helper.pointToTimePrice(x, y, magnetEnabled);
      const orig = drag.orig;

      if (typeof drag.handle === 'number' && orig.type === 'path' && orig.points) {
        const nextPts = [...orig.points];
        nextPts[drag.handle] = pt;
        onUpdateDrawing({ ...orig, points: nextPts, t1: nextPts[0].time, p1: nextPts[0].price, t2: nextPts[nextPts.length - 1].time, p2: nextPts[nextPts.length - 1].price });
        syncCrosshairToPoint(helper.chart, helper.candleSeries, pt.time, pt.price);
      } else if (drag.handle === 'p1') {
        onUpdateDrawing({ ...orig, t1: pt.time, p1: pt.price });
        syncCrosshairToPoint(helper.chart, helper.candleSeries, pt.time, pt.price);
      } else if (drag.handle === 'p2') {
        onUpdateDrawing({ ...orig, t2: pt.time, p2: pt.price });
        syncCrosshairToPoint(helper.chart, helper.candleSeries, pt.time, pt.price);
      } else if (drag.handle === 'p3') {
        onUpdateDrawing({ ...orig, t2: pt.time, p3: pt.price });
        syncCrosshairToPoint(helper.chart, helper.candleSeries, pt.time, pt.price);
      } else if (drag.handle === 'move') {
        const startT = helper.xToTime(drag.startX);
        const startP = helper.candleSeries.coordinateToPrice(drag.startY) ?? orig.p1;
        const dt = pt.time - startT;
        const dp = (helper.candleSeries.coordinateToPrice(y) ?? orig.p1) - startP;
        onUpdateDrawing({
          ...orig,
          t1: orig.t1 + dt, t2: orig.t2 + dt,
          p1: orig.p1 + dp, p2: orig.p2 + dp,
          p3: orig.p3 !== undefined ? orig.p3 + dp : undefined,
          points: orig.points ? orig.points.map((p) => ({ time: p.time + dt, price: p.price + dp })) : undefined,
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      clearSyncedCrosshair(chartRef.current);
      chartRef.current?.applyOptions({ handleScroll: true, handleScale: true });
    }
  };

  const handleDoubleClick = () => {
    if (activeTool === 'path' && draftDrawing) {
      const pts = draftDrawing.points || [];
      const cleanPts = pts.length > 2 ? pts.slice(0, -1) : pts;
      if (cleanPts.length >= 2) {
        const finished = { ...draftDrawing, points: cleanPts };
        onAddDrawing(finished);
        onSelectDrawing(finished.id);
      }
      setDraftDrawing(null);
      setCursorPt(null);
      onFinishTool();
      return;
    }

    if (!selectedDrawingId) return;
    const found = drawings.find((d) => d.id === selectedDrawingId);
    if (found) onDoubleClickDrawing(found);
  };

  const drawArrowHead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, size = 10) => {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.moveTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  };

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    const allPlots = outputs.flatMap((out) => out.plots);
    // 多餘的舊線條才移除，既有的線條原地更新顏色與數據，避免整張重畫閃爍
    while (lineSeriesListRef.current.length > allPlots.length) {
      const extra = lineSeriesListRef.current.pop();
      if (extra) chart.removeSeries(extra);
    }
    allPlots.forEach((p, idx) => {
      let ls = lineSeriesListRef.current[idx] as (ISeriesApi<'Line'> & { _lastLen?: number; _firstTime?: number }) | undefined;
      if (!ls) {
        ls = chart.addSeries(LineSeries, { color: p.color, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false }) as any;
        lineSeriesListRef.current.push(ls!);
      } else {
        ls.applyOptions({ color: p.color, lineWidth: p.width as any });
      }
      const d = p.data || [];
      const firstT = d.length > 0 ? d[0].time : undefined;
      const prevLen = ls!._lastLen ?? -1;
      const prevFirstT = ls!._firstTime;

      if (d.length > 0 && prevFirstT === firstT && (d.length === prevLen || d.length === prevLen + 1)) {
        ls!.update(d[d.length - 1] as any);
      } else {
        ls!.setData(d as any);
      }
      ls!._lastLen = d.length;
      ls!._firstTime = firstT;
    });

    const drawOverlay = () => {
      const canvas = overlayRef.current;
      const container = containerRef.current;
      const helper = getCoordsHelper();
      if (!canvas || !container || !helper) return;

      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 若處於回放選擇剪刀位置模式，畫出藍色垂直切割預覽線
      if (replaySelecting && hoverReplayX !== null) {
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2;
        ctx.moveTo(hoverReplayX, 0);
        ctx.lineTo(hoverReplayX, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      outputs.forEach((out) => {
        out.lines.forEach((ln) => {
          const x1 = helper.timeToX(ln.t1);
          const x2 = helper.timeToX(ln.t2);
          const y1 = candleSeries.priceToCoordinate(ln.p1);
          const y2 = candleSeries.priceToCoordinate(ln.p2);
          if (x1 === null || x2 === null || y1 === null || y2 === null) return;
          ctx.beginPath();
          ctx.strokeStyle = ln.color;
          ctx.lineWidth = ln.width;
          ctx.setLineDash(ln.dashed ? [6, 4] : []);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.font = '11px sans-serif';
        out.labels.forEach((lb) => {
          const x = helper.timeToX(lb.time);
          const y = candleSeries.priceToCoordinate(lb.price);
          if (x === null || y === null) return;
          ctx.fillStyle = lb.color;
          ctx.fillText(lb.text, x + 4, y - 4);
        });
      });

      const renderList = [...drawings.filter((d) => d.symbol === symbol)];
      if (draftDrawing) renderList.push(draftDrawing);

      renderList.forEach((d) => {
        const isSel = d.id === selectedDrawingId;
        ctx.setLineDash(d.dashed ? [6, 4] : []);

        if (d.type === 'path') {
          const pts = [...(d.points || [])];
          if (d.id === draftDrawing?.id && cursorPt) pts.push(cursorPt);
          if (pts.length >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = d.color;
            ctx.lineWidth = d.lineWidth;
            let prevX = 0, prevY = 0, lastX = 0, lastY = 0;
            pts.forEach((pt, idx) => {
              const px = helper.timeToX(pt.time);
              const py = candleSeries.priceToCoordinate(pt.price);
              if (px === null || py === null) return;
              if (idx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
              prevX = lastX; prevY = lastY;
              lastX = px; lastY = py;
            });
            ctx.stroke();
            if (d.arrowEnd !== false) drawArrowHead(ctx, prevX, prevY, lastX, lastY, d.color, 11);
          }
          if (isSel && !d.locked && d.points) {
            d.points.forEach((pt) => {
              const px = helper.timeToX(pt.time);
              const py = candleSeries.priceToCoordinate(pt.price);
              if (px !== null && py !== null) {
                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#2962ff';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            });
          }
          return;
        }

        const x1 = helper.timeToX(d.t1);
        const y1 = candleSeries.priceToCoordinate(d.p1);
        const x2 = helper.timeToX(d.t2);
        const y2 = candleSeries.priceToCoordinate(d.p2);
        if (x1 === null || y1 === null || x2 === null || y2 === null) return;

        // --- TEXT 文字標註渲染 ---
        if (d.type === 'text') {
          const fSize = d.fontSize || 13;
          const txt = d.text || '文字標註';
          ctx.font = `bold ${fSize}px sans-serif`;
          const metrics = ctx.measureText(txt);
          const padX = 8;
          const boxW = metrics.width + padX * 2;
          const boxH = fSize + 10;
          const topY = y1 - boxH;

          if (d.bgColor && d.bgColor !== 'transparent') {
            ctx.fillStyle = d.bgColor;
            ctx.fillRect(x1, topY, boxW, boxH);
          }
          if (isSel) {
            ctx.strokeStyle = '#2962ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x1, topY, boxW, boxH);
          }
          ctx.fillStyle = d.color || '#ffffff';
          ctx.fillText(txt, x1 + padX, y1 - 6);
          return;
        }

        if (d.type === 'frvp') {
          const cfg = d.frvpConfig || DEFAULT_FRVP_CONFIG;
          const minT = Math.min(d.t1, d.t2);
          const maxT = Math.max(d.t1, d.t2);
          const leftX = Math.min(x1, x2);
          const rightX = cfg.extendRight ? w : Math.max(x1, x2);
          const rangeW = Math.max(40, Math.max(x1, x2) - leftX);
          const maxBarW = rangeW * 0.42;

          const rangeBars = bars.filter((b) => b.time >= minT && b.time <= maxT);
          if (rangeBars.length > 0) {
            const hi = Math.max(...rangeBars.map((b) => b.high));
            const lo = Math.min(...rangeBars.map((b) => b.low));
            const rowsCount = Math.max(10, Math.min(500, cfg.rows || 200));
            const stepP = (hi - lo) / rowsCount || 0.0001;

            const upVols = new Array(rowsCount).fill(0);
            const dnVols = new Array(rowsCount).fill(0);

            for (const b of rangeBars) {
              const vol = b.volume || 1;
              const barRange = Math.max(b.high - b.low, stepP * 0.1);
              const bodyTop = Math.max(b.open, b.close);
              const bodyBot = Math.min(b.open, b.close);
              const buyRatio = Math.max(0.15, Math.min(0.85, (b.close - b.low) / barRange));
              const upVolTotal = vol * buyRatio;
              const dnVolTotal = vol * (1 - buyRatio);

              const startRow = Math.max(0, Math.floor((b.low - lo) / stepP));
              const endRow = Math.min(rowsCount - 1, Math.floor((b.high - lo) / stepP));

              let weightSum = 0;
              const rowWeights: number[] = [];
              for (let r = startRow; r <= endRow; r++) {
                const rowMid = lo + (r + 0.5) * stepP;
                let wRow = 1.0;
                if (rowMid > bodyTop && b.high > bodyTop) {
                  const distRatio = Math.min(1, (rowMid - bodyTop) / (b.high - bodyTop));
                  wRow = 0.45 * (1 - distRatio * 0.85);
                } else if (rowMid < bodyBot && bodyBot > b.low) {
                  const distRatio = Math.min(1, (bodyBot - rowMid) / (bodyBot - b.low));
                  wRow = 0.45 * (1 - distRatio * 0.85);
                }
                rowWeights.push(wRow);
                weightSum += wRow;
              }

              if (weightSum > 0) {
                for (let idx = 0; idx < rowWeights.length; idx++) {
                  const r = startRow + idx;
                  const share = rowWeights[idx] / weightSum;
                  upVols[r] += upVolTotal * share;
                  dnVols[r] += dnVolTotal * share;
                }
              }
            }

            const totVols = upVols.map((u, idx) => u + dnVols[idx]);
            const maxRowVol = Math.max(...totVols) || 1;
            const totalAllVol = totVols.reduce((a, b) => a + b, 0) || 1;

            let pocIdx = 0;
            for (let r = 1; r < rowsCount; r++) {
              if (totVols[r] > totVols[pocIdx]) pocIdx = r;
            }

            const targetVaVol = totalAllVol * ((cfg.vaPercent || 70) / 100);
            let accVaVol = totVols[pocIdx];
            let lowVaIdx = pocIdx;
            let highVaIdx = pocIdx;
            while (accVaVol < targetVaVol && (lowVaIdx > 0 || highVaIdx < rowsCount - 1)) {
              const upAdd = highVaIdx < rowsCount - 1 ? totVols[highVaIdx + 1] : -1;
              const dnAdd = lowVaIdx > 0 ? totVols[lowVaIdx - 1] : -1;
              if (upAdd >= dnAdd && highVaIdx < rowsCount - 1) { highVaIdx++; accVaVol += upAdd; }
              else if (lowVaIdx > 0) { lowVaIdx--; accVaVol += dnAdd; }
              else break;
            }

            for (let r = 0; r < rowsCount; r++) {
              if (totVols[r] <= 0) continue;
              const pBottom = lo + r * stepP;
              const pTop = pBottom + stepP;
              const yTop = candleSeries.priceToCoordinate(pTop);
              const yBot = candleSeries.priceToCoordinate(pBottom);
              if (yTop === null || yBot === null) continue;
              const rowH = Math.max(1, Math.abs(yBot - yTop));
              const inVA = r >= lowVaIdx && r <= highVaIdx;

              if (cfg.volumeMode === 'up_down') {
                const upW = (upVols[r] / maxRowVol) * maxBarW;
                const dnW = (dnVols[r] / maxRowVol) * maxBarW;
                ctx.fillStyle = inVA ? 'rgba(0, 188, 212, 0.72)' : 'rgba(0, 188, 212, 0.28)';
                ctx.fillRect(leftX, yTop, upW, rowH);
                ctx.fillStyle = inVA ? 'rgba(255, 213, 79, 0.78)' : 'rgba(255, 213, 79, 0.30)';
                ctx.fillRect(leftX + upW, yTop, dnW, rowH);
              } else {
                const totW = (totVols[r] / maxRowVol) * maxBarW;
                ctx.fillStyle = inVA ? 'rgba(41, 98, 255, 0.72)' : 'rgba(120, 123, 134, 0.32)';
                ctx.fillRect(leftX, yTop, totW, rowH);
              }
            }

            const vahPrice = lo + (highVaIdx + 1) * stepP;
            const valPrice = lo + lowVaIdx * stepP;
            const pocPrice = lo + (pocIdx + 0.5) * stepP;
            const yVah = candleSeries.priceToCoordinate(vahPrice);
            const yVal = candleSeries.priceToCoordinate(valPrice);
            const yPoc = candleSeries.priceToCoordinate(pocPrice);

            ctx.setLineDash([]);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            if (yVah !== null) { ctx.beginPath(); ctx.moveTo(leftX, yVah); ctx.lineTo(rightX, yVah); ctx.stroke(); }
            if (yVal !== null) { ctx.beginPath(); ctx.moveTo(leftX, yVal); ctx.lineTo(rightX, yVal); ctx.stroke(); }

            if (yPoc !== null) {
              ctx.setLineDash([6, 5]);
              ctx.strokeStyle = '#f23645';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(leftX, yPoc);
              ctx.lineTo(rightX, yPoc);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        } else if (d.type === 'trendline') {
          ctx.beginPath();
          ctx.strokeStyle = d.color;
          ctx.lineWidth = d.lineWidth;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (d.type === 'hline') {
          ctx.beginPath();
          ctx.strokeStyle = d.color;
          ctx.lineWidth = d.lineWidth;
          ctx.moveTo(0, y1);
          ctx.lineTo(w, y1);
          ctx.stroke();
        } else if (d.type === 'rect') {
          const rx = Math.min(x1, x2);
          const ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1);
          const rh = Math.abs(y2 - y1);
          ctx.fillStyle = d.fillColor || 'rgba(41, 98, 255, 0.16)';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = d.color;
          ctx.lineWidth = d.lineWidth;
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (d.type === 'fibo') {
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#787b86';
          ctx.lineWidth = 1;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);

          const minX = Math.min(x1, x2);
          const maxX = d.extendRight ? w : Math.max(x1, x2);
          const levels = d.fiboLevels || DEFAULT_FIBO_LEVELS;
          ctx.font = '11px monospace';

          levels.forEach((lv) => {
            if (!lv.enabled) return;
            const priceAtLv = d.p2 + (d.p1 - d.p2) * lv.value;
            const yLv = candleSeries.priceToCoordinate(priceAtLv);
            if (yLv === null) return;
            ctx.beginPath();
            ctx.strokeStyle = lv.color;
            ctx.lineWidth = 1.5;
            ctx.moveTo(minX, yLv);
            ctx.lineTo(maxX, yLv);
            ctx.stroke();
            ctx.fillStyle = lv.color;
            ctx.fillText(`${lv.value} (${priceAtLv.toFixed(priceAtLv < 1 ? 5 : 2)})`, minX + 4, yLv - 3);
          });
        } else if (d.type === 'long' || d.type === 'short') {
          const y3 = d.p3 !== undefined ? candleSeries.priceToCoordinate(d.p3) ?? y1 : y1;
          const leftX = Math.min(x1, x2);
          const rightX = Math.max(x1, x2, leftX + 60);
          const boxW = rightX - leftX;

          const tpTop = Math.min(y1, y3);
          const tpH = Math.abs(y3 - y1);
          ctx.fillStyle = 'rgba(8, 153, 129, 0.22)';
          ctx.fillRect(leftX, tpTop, boxW, tpH);
          ctx.strokeStyle = '#089981';
          ctx.lineWidth = 1;
          ctx.strokeRect(leftX, tpTop, boxW, tpH);

          const slTop = Math.min(y1, y2);
          const slH = Math.abs(y2 - y1);
          ctx.fillStyle = 'rgba(242, 54, 69, 0.22)';
          ctx.fillRect(leftX, slTop, boxW, slH);
          ctx.strokeStyle = '#f23645';
          ctx.lineWidth = 1;
          ctx.strokeRect(leftX, slTop, boxW, slH);

          ctx.beginPath();
          ctx.strokeStyle = '#d1d4dc';
          ctx.lineWidth = 1.5;
          ctx.moveTo(leftX, y1);
          ctx.lineTo(rightX, y1);
          ctx.stroke();

          const m = calcPositionMetrics(d);
          const qtyStr = m.qty >= 100 ? m.qty.toFixed(1) : m.qty >= 1 ? m.qty.toFixed(3) : m.qty.toFixed(5);
          const badgeText = `顆數: ${qtyStr} | R:R ${m.rr.toFixed(2)} | 風險 -$${m.riskUsd.toFixed(1)} | 保證金 $${m.marginUsd.toFixed(1)}`;
          ctx.font = 'bold 11px sans-serif';
          const textW = ctx.measureText(badgeText).width + 12;
          const badgeY = d.type === 'long' ? tpTop - 20 : tpTop + tpH + 4;
          ctx.fillStyle = 'rgba(30, 34, 45, 0.92)';
          ctx.fillRect(leftX, badgeY, textW, 18);
          ctx.strokeStyle = '#363a45';
          ctx.strokeRect(leftX, badgeY, textW, 18);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(badgeText, leftX + 6, badgeY + 13);
        }

        if (isSel && !d.locked) {
          ctx.setLineDash([]);
          const drawHandle = (hx: number, hy: number, fill = '#ffffff') => {
            ctx.beginPath();
            ctx.arc(hx, hy, 5, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = '#2962ff';
            ctx.lineWidth = 2;
            ctx.stroke();
          };
          drawHandle(x1, y1);
          if (d.type !== 'hline') drawHandle(x2, y2);
          if ((d.type === 'long' || d.type === 'short') && d.p3 !== undefined) {
            const y3 = candleSeries.priceToCoordinate(d.p3);
            if (y3 !== null) drawHandle(x2, y3, '#089981');
          }
        }
      });

      ctx.restore();
    };

    drawOverlayFnRef.current = drawOverlay;
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      drawOverlayFnRef.current?.();
    });
  }, [bars, outputs, drawings, draftDrawing, cursorPt, selectedDrawingId, symbol, replaySelecting, hoverReplayX]);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => { if (activeTool === 'path') e.preventDefault(); }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      className={`relative w-full h-full overflow-hidden ${(activeTool !== 'cursor' || replaySelecting) ? 'cursor-crosshair' : ''}`}
    >
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 w-full h-full" />
    </div>
  );
};
