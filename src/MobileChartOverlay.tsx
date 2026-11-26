import React, { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  DEFAULT_FIBO_LEVELS,
  type DrawingItem,
  type DrawingToolType,
  type FiboLevel,
  type PositionConfig,
} from './ChartCanvas';
import type { Bar } from './indicatorEngine';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  candleSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  bars: Bar[];
  symbol: string;
  activeTool: DrawingToolType;
  drawings: DrawingItem[];
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  onAddDrawing: (d: DrawingItem) => void;
  onUpdateDrawing: (d: DrawingItem) => void;
  onFinishTool: () => void;
  defaultFiboLevels: FiboLevel[];
  defaultPosConfig: PositionConfig;
  pathFinishReq?: number;
  onPathPointsCountChange?: (count: number) => void;
}

export const MobileChartOverlay: React.FC<Props> = ({
  chartRef,
  candleSeriesRef,
  bars,
  symbol,
  activeTool,
  drawings,
  selectedDrawingId,
  onSelectDrawing,
  onAddDrawing,
  onUpdateDrawing,
  onFinishTool,
  defaultFiboLevels,
  defaultPosConfig,
  pathFinishReq = 0,
  onPathPointsCountChange,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draft, setDraft] = useState<DrawingItem | null>(null);
  const [crosshairXY, setCrosshairXY] = useState<{ x: number; y: number } | null>(null);

  const latestRef = useRef({
    bars, symbol, activeTool, drawings, selectedDrawingId,
    defaultFiboLevels, defaultPosConfig,
    onSelectDrawing, onAddDrawing, onUpdateDrawing, onFinishTool, onPathPointsCountChange,
  });
  latestRef.current = {
    bars, symbol, activeTool, drawings, selectedDrawingId,
    defaultFiboLevels, defaultPosConfig,
    onSelectDrawing, onAddDrawing, onUpdateDrawing, onFinishTool, onPathPointsCountChange,
  };

  const fsmRef = useRef<{
    phase: 'AIM_P1' | 'AIM_P2';
    draft: DrawingItem | null;
    cursorX: number;
    cursorY: number;
    touchStartX: number;
    touchStartY: number;
    lastTouchX: number;
    lastTouchY: number;
    moved: boolean;
  }>({
    phase: 'AIM_P1', draft: null, cursorX: 160, cursorY: 280,
    touchStartX: 0, touchStartY: 0, lastTouchX: 0, lastTouchY: 0, moved: false,
  });

  const syncChartCrosshair = (time: number, price: number) => {
    try {
      const c = chartRef.current as any;
      const s = candleSeriesRef.current;
      if (c && s && typeof c.setCrosshairPosition === "function") {
        c.setCrosshairPosition(price, time as any, s);
      }
    } catch {}
  };

  const clearChartCrosshair = () => {
    try {
      const c = chartRef.current as any;
      if (c && typeof c.clearCrosshairPosition === "function") {
        c.clearCrosshairPosition();
      }
    } catch {}
  };

  const editDragRef = useRef<{
    id: string;
    handle: 'p1' | 'p2' | 'p3' | 'move' | number;
    startX: number;
    startY: number;
    orig: DrawingItem;
  } | null>(null);

  // 外部按下「完成路徑」時提交折線
  useEffect(() => {
    if (!pathFinishReq) return;
    const fsm = fsmRef.current;
    if (fsm.draft && fsm.draft.type === 'path' && (fsm.draft.points?.length || 0) >= 2) {
      const pts = fsm.draft.points!;
      const finished: DrawingItem = {
        ...fsm.draft,
        t1: pts[0].time,
        p1: pts[0].price,
        t2: pts[pts.length - 1].time,
        p2: pts[pts.length - 1].price,
      };
      onAddDrawing(finished);
      onSelectDrawing(finished.id);
    }
    fsm.phase = 'AIM_P1';
    fsm.draft = null;
    setDraft(null);
    onPathPointsCountChange?.(0);
    onFinishTool();
  }, [pathFinishReq]);

  useEffect(() => {
    setDraft(null);
    onPathPointsCountChange?.(0);
    if (activeTool === "cursor") {
      if (!editDragRef.current) setCrosshairXY(null);
    } else {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const cx = rect ? Math.round(rect.width * 0.45) : 160;
      const cy = rect ? Math.round(rect.height * 0.45) : 280;
      fsmRef.current = {
        phase: 'AIM_P1', draft: null, cursorX: cx, cursorY: cy,
        touchStartX: 0, touchStartY: 0, lastTouchX: 0, lastTouchY: 0, moved: false,
      };
      setCrosshairXY({ x: cx, y: cy });
    }
  }, [activeTool, symbol]);

  const getCoords = () => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const curBars = latestRef.current.bars;
    if (!chart || !series || curBars.length === 0) return null;
    const ts = chart.timeScale();
    const firstBar = curBars[0];
    const lastBar = curBars[curBars.length - 1];
    const step = curBars.length > 1 ? curBars[1].time - curBars[0].time : 900;

    const getPxPerBar = () => {
      if (curBars.length < 2) return 8;
      const x1 = ts.timeToCoordinate(curBars[curBars.length - 2].time as any);
      const x2 = ts.timeToCoordinate(curBars[curBars.length - 1].time as any);
      return x1 !== null && x2 !== null && x2 > x1 ? x2 - x1 : 8;
    };

    const timeToX = (t: number): number | null => {
      const ppb = getPxPerBar();
      if (t <= lastBar.time && t >= firstBar.time) {
        let closest = curBars[0].time;
        let minD = Math.abs(t - closest);
        for (let i = 1; i < curBars.length; i++) {
          const d = Math.abs(t - curBars[i].time);
          if (d < minD) { minD = d; closest = curBars[i].time; }
        }
        const c = ts.timeToCoordinate(closest as any);
        if (c !== null) return c;
        const lx = ts.timeToCoordinate(lastBar.time as any);
        return lx !== null ? lx - ((lastBar.time - closest) / step) * ppb : null;
      } else if (t > lastBar.time) {
        const lx = ts.timeToCoordinate(lastBar.time as any);
        return lx !== null ? lx + ((t - lastBar.time) / step) * ppb : null;
      } else {
        const fx = ts.timeToCoordinate(firstBar.time as any);
        return fx !== null ? fx - ((firstBar.time - t) / step) * ppb : -200;
      }
    };

    const xToTime = (x: number): number => {
      const t = ts.coordinateToTime(x);
      if (t !== null) return Number(t);
      const lx = ts.timeToCoordinate(lastBar.time as any) ?? 0;
      return Math.round(lastBar.time + ((x - lx) / getPxPerBar()) * step);
    };

    const xyToData = (x: number, y: number) => ({
      time: xToTime(x),
      price: series.coordinateToPrice(y) ?? lastBar.close,
    });

    return { chart, series, timeToX, xToTime, xyToData, step, lastBar };
  };

  useEffect(() => {
    const onWinTouchStart = (e: TouchEvent) => {
      if (latestRef.current.activeTool !== 'cursor') return;
      if (e.touches.length !== 1) return;
      const el = wrapperRef.current;
      const coords = getCoords();
      if (!el || !coords) return;

      const target = e.target as HTMLElement | null;
      if (target && target.closest('button')) return;

      const rect = el.getBoundingClientRect();
      const t = e.touches[0];
      if (t.clientX < rect.left || t.clientX > rect.right || t.clientY < rect.top || t.clientY > rect.bottom) return;

      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      const { drawings: curDrawings, selectedDrawingId: selId, symbol: curSym, onSelectDrawing: selectFn } = latestRef.current;
      const symDrawings = curDrawings.filter((d) => d.symbol === curSym);

      if (selId) {
        const sel = symDrawings.find((d) => d.id === selId);
        if (sel && !sel.locked) {
          if (sel.type === 'path' && sel.points) {
            for (let idx = 0; idx < sel.points.length; idx++) {
              const px = coords.timeToX(sel.points[idx].time);
              const py = coords.series.priceToCoordinate(sel.points[idx].price);
              if (px !== null && py !== null && Math.hypot(x - px, y - py) < 28) {
                e.stopPropagation();
                editDragRef.current = { id: sel.id, handle: idx, startX: x, startY: y, orig: JSON.parse(JSON.stringify(sel)) };
                coords.chart.applyOptions({ handleScroll: false, handleScale: false });
                setCrosshairXY({ x: px, y: py });
                syncChartCrosshair(sel.points[idx].time, sel.points[idx].price);
                return;
              }
            }
          } else {
            const x1 = coords.timeToX(sel.t1);
            const y1 = coords.series.priceToCoordinate(sel.p1);
            const x2 = coords.timeToX(sel.t2);
            const y2 = coords.series.priceToCoordinate(sel.p2);
            const y3 = sel.p3 !== undefined ? coords.series.priceToCoordinate(sel.p3) : null;

            if (x1 !== null && y1 !== null && Math.hypot(x - x1, y - y1) < 28) {
              e.stopPropagation();
              editDragRef.current = { id: sel.id, handle: "p1", startX: x, startY: y, orig: { ...sel } };
              coords.chart.applyOptions({ handleScroll: false, handleScale: false });
              setCrosshairXY({ x: x1, y: y1 });
              syncChartCrosshair(sel.t1, sel.p1);
              return;
            }
            if (x2 !== null && y2 !== null && Math.hypot(x - x2, y - y2) < 28) {
              e.stopPropagation();
              editDragRef.current = { id: sel.id, handle: "p2", startX: x, startY: y, orig: { ...sel } };
              coords.chart.applyOptions({ handleScroll: false, handleScale: false });
              setCrosshairXY({ x: x2, y: y2 });
              syncChartCrosshair(sel.t2, sel.p2);
              return;
            }
            if (x2 !== null && y3 !== null && sel.p3 !== undefined && Math.hypot(x - x2, y - y3) < 28) {
              e.stopPropagation();
              editDragRef.current = { id: sel.id, handle: "p3", startX: x, startY: y, orig: { ...sel } };
              coords.chart.applyOptions({ handleScroll: false, handleScale: false });
              setCrosshairXY({ x: x2, y: y3 });
              syncChartCrosshair(sel.t2, sel.p3);
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
            const px1 = coords.timeToX(d.points[k - 1].time);
            const py1 = coords.series.priceToCoordinate(d.points[k - 1].price);
            const px2 = coords.timeToX(d.points[k].time);
            const py2 = coords.series.priceToCoordinate(d.points[k].price);
            if (px1 === null || py1 === null || px2 === null || py2 === null) continue;
            const len2 = (px2 - px1) ** 2 + (py2 - py1) ** 2;
            if (len2 > 0) {
              const proj = Math.max(0, Math.min(1, ((x - px1) * (px2 - px1) + (y - py1) * (py2 - py1)) / len2));
              if (Math.hypot(x - (px1 + proj * (px2 - px1)), y - (py1 + proj * (py2 - py1))) < 24) { hit = true; break; }
            }
          }
        } else {
          const x1 = coords.timeToX(d.t1);
          const y1 = coords.series.priceToCoordinate(d.p1);
          const x2 = coords.timeToX(d.t2);
          const y2 = coords.series.priceToCoordinate(d.p2);
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

          if (d.type === 'hline') hit = Math.abs(y - y1) < 24;
          else if (d.type === 'rect' || d.type === 'fibo' || d.type === 'frvp') {
            hit = x >= Math.min(x1, x2) - 16 && x <= Math.max(x1, x2) + 16 && y >= Math.min(y1, y2) - 16 && y <= Math.max(y1, y2) + 16;
          } else if (d.type === 'long' || d.type === 'short') {
            const y3 = d.p3 !== undefined ? coords.series.priceToCoordinate(d.p3) ?? y1 : y1;
            hit = x >= Math.min(x1, x2) - 16 && x <= Math.max(x1, x2) + 16 && y >= Math.min(y1, y2, y3) - 16 && y <= Math.max(y1, y2, y3) + 16;
          } else {
            const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
            if (len2 > 0) {
              const proj = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / len2));
              hit = Math.hypot(x - (x1 + proj * (x2 - x1)), y - (y1 + proj * (y2 - y1))) < 24;
            }
          }
        }

        if (hit) {
          e.stopPropagation();
          selectFn(d.id);
          if (!d.locked) {
            editDragRef.current = { id: d.id, handle: "move", startX: x, startY: y, orig: JSON.parse(JSON.stringify(d)) };
            coords.chart.applyOptions({ handleScroll: false, handleScale: false });
            setCrosshairXY({ x, y });
            const curPt = coords.xyToData(x, y);
            syncChartCrosshair(curPt.time, curPt.price);
          }
          return;
        }
      }

      if (selId) selectFn(null);
    };

    const onWinTouchMove = (e: TouchEvent) => {
      const drag = editDragRef.current;
      if (!drag || drag.orig.locked || e.touches.length !== 1) return;
      const el = wrapperRef.current;
      const coords = getCoords();
      if (!el || !coords) return;

      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      const pt = coords.xyToData(x, y);
      const orig = drag.orig;
      setCrosshairXY({ x, y });
      syncChartCrosshair(pt.time, pt.price);

      if (typeof drag.handle === 'number' && orig.type === 'path' && orig.points) {
        const nextPts = [...orig.points];
        nextPts[drag.handle] = pt;
        latestRef.current.onUpdateDrawing({ ...orig, points: nextPts, t1: nextPts[0].time, p1: nextPts[0].price, t2: nextPts[nextPts.length - 1].time, p2: nextPts[nextPts.length - 1].price });
      } else if (drag.handle === 'p1') latestRef.current.onUpdateDrawing({ ...orig, t1: pt.time, p1: pt.price });
      else if (drag.handle === 'p2') latestRef.current.onUpdateDrawing({ ...orig, t2: pt.time, p2: pt.price });
      else if (drag.handle === 'p3') latestRef.current.onUpdateDrawing({ ...orig, t2: pt.time, p3: pt.price });
      else if (drag.handle === 'move') {
        const dt = pt.time - coords.xToTime(drag.startX);
        const dp = pt.price - (coords.series.coordinateToPrice(drag.startY) ?? orig.p1);
        latestRef.current.onUpdateDrawing({
          ...orig,
          t1: orig.t1 + dt, t2: orig.t2 + dt,
          p1: orig.p1 + dp, p2: orig.p2 + dp,
          p3: orig.p3 !== undefined ? orig.p3 + dp : undefined,
          points: orig.points ? orig.points.map((p) => ({ time: p.time + dt, price: p.price + dp })) : undefined,
        });
      }
    };

    const onWinTouchEnd = () => {
      if (editDragRef.current) {
        editDragRef.current = null;
        clearChartCrosshair();
        if (latestRef.current.activeTool === "cursor") {
          setCrosshairXY(null);
        }
        chartRef.current?.applyOptions({ handleScroll: true, handleScale: true });
      }
    };

    window.addEventListener('touchstart', onWinTouchStart, { capture: true, passive: false });
    window.addEventListener('touchmove', onWinTouchMove, { capture: true, passive: false });
    window.addEventListener('touchend', onWinTouchEnd, { capture: true });
    return () => {
      window.removeEventListener('touchstart', onWinTouchStart, { capture: true });
      window.removeEventListener('touchmove', onWinTouchMove, { capture: true });
      window.removeEventListener('touchend', onWinTouchEnd, { capture: true });
    };
  }, []);

  useEffect(() => {
    let raf: number | null = null;
    const render = () => {
      const canvas = canvasRef.current;
      const coords = getCoords();
      if (!canvas || !coords) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (draft) {
        if (draft.type === 'path' && draft.points && draft.points.length >= 1) {
          const pts = [...draft.points];
          if (crosshairXY) {
            pts.push(coords.xyToData(crosshairXY.x, crosshairXY.y));
          }
          if (pts.length >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            pts.forEach((pt, i) => {
              const px = coords.timeToX(pt.time);
              const py = coords.series.priceToCoordinate(pt.price);
              if (px === null || py === null) return;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.stroke();
          }
          draft.points.forEach((pt) => {
            const px = coords.timeToX(pt.time);
            const py = coords.series.priceToCoordinate(pt.price);
            if (px !== null && py !== null) {
              ctx.beginPath();
              ctx.arc(px, py, 6, 0, Math.PI * 2);
              ctx.fillStyle = '#facc15';
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
            }
          });
        } else {
          const x1 = coords.timeToX(draft.t1);
          const y1 = coords.series.priceToCoordinate(draft.p1);
          const x2 = coords.timeToX(draft.t2);
          const y2 = coords.series.priceToCoordinate(draft.p2);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            if (draft.type === 'trendline') {
              ctx.beginPath();
              ctx.strokeStyle = '#2962ff';
              ctx.lineWidth = 2;
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            } else if (draft.type === 'rect') {
              const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
              const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
              ctx.fillStyle = 'rgba(41, 98, 255, 0.18)';
              ctx.fillRect(rx, ry, rw, rh);
              ctx.strokeStyle = '#2962ff';
              ctx.lineWidth = 2;
              ctx.strokeRect(rx, ry, rw, rh);
            } else if (draft.type === 'fibo') {
              ctx.beginPath();
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = '#787b86';
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              ctx.setLineDash([]);
              const minX = Math.min(x1, x2);
              const maxX = Math.max(x1, x2);
              (draft.fiboLevels || DEFAULT_FIBO_LEVELS).forEach((lv) => {
                if (!lv.enabled) return;
                const pLv = draft.p2 + (draft.p1 - draft.p2) * lv.value;
                const yLv = coords.series.priceToCoordinate(pLv);
                if (yLv === null) return;
                ctx.beginPath();
                ctx.strokeStyle = lv.color;
                ctx.lineWidth = 1.5;
                ctx.moveTo(minX, yLv);
                ctx.lineTo(maxX, yLv);
                ctx.stroke();
              });
            }

            ctx.beginPath();
            ctx.arc(x1, y1, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#2962ff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        }
      }

      if ((activeTool !== "cursor" || editDragRef.current !== null) && crosshairXY) {
        const { x, y } = crosshairXY;
        ctx.save();
        ctx.strokeStyle = 'rgba(41, 98, 255, 0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(41, 98, 255, 0.25)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#2962ff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
      }

      if (activeTool === 'cursor' && selectedDrawingId) {
        const sel = drawings.find((d) => d.id === selectedDrawingId && d.symbol === symbol);
        if (sel && !sel.locked) {
          const drawThumbHandle = (hx: number | null, hy: number | null, fill = '#ffffff') => {
            if (hx === null || hy === null) return;
            ctx.beginPath();
            ctx.arc(hx, hy, 8, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#2962ff';
            ctx.stroke();
          };
          if (sel.type === 'path' && sel.points) {
            sel.points.forEach((p) => drawThumbHandle(coords.timeToX(p.time), coords.series.priceToCoordinate(p.price)));
          } else {
            const x1 = coords.timeToX(sel.t1);
            const y1 = coords.series.priceToCoordinate(sel.p1);
            const x2 = coords.timeToX(sel.t2);
            const y2 = coords.series.priceToCoordinate(sel.p2);
            drawThumbHandle(x1, y1);
            if (sel.type !== 'hline' && sel.type !== 'text') drawThumbHandle(x2, y2);
            if ((sel.type === 'long' || sel.type === 'short') && sel.p3 !== undefined) {
              drawThumbHandle(x2, coords.series.priceToCoordinate(sel.p3), '#089981');
            }
          }
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { if (raf !== null) cancelAnimationFrame(raf); };
  }, [draft, crosshairXY, activeTool, selectedDrawingId, drawings, symbol, bars]);

  const handleDrawTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeTool === 'cursor' || e.touches.length !== 1) return;
    e.stopPropagation();
    const t = e.touches[0];
    const fsm = fsmRef.current;
    fsm.touchStartX = t.clientX;
    fsm.touchStartY = t.clientY;
    fsm.lastTouchX = t.clientX;
    fsm.lastTouchY = t.clientY;
    fsm.moved = false;
  };

  const handleDrawTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeTool === 'cursor' || e.touches.length !== 1) return;
    e.stopPropagation();
    const t = e.touches[0];
    const fsm = fsmRef.current;

    if (Math.hypot(t.clientX - fsm.touchStartX, t.clientY - fsm.touchStartY) > 6) {
      fsm.moved = true;
    }

    const dx = t.clientX - fsm.lastTouchX;
    const dy = t.clientY - fsm.lastTouchY;
    fsm.lastTouchX = t.clientX;
    fsm.lastTouchY = t.clientY;

    const rect = e.currentTarget.getBoundingClientRect();
    const nextX = Math.max(8, Math.min(rect.width - 48, fsm.cursorX + dx));
    const nextY = Math.max(16, Math.min(rect.height - 28, fsm.cursorY + dy));
    fsm.cursorX = nextX;
    fsm.cursorY = nextY;
    setCrosshairXY({ x: nextX, y: nextY });

    if (fsm.phase === 'AIM_P2' && fsm.draft && fsm.draft.type !== 'path') {
      const coords = getCoords();
      if (!coords) return;
      const pt = coords.xyToData(nextX, nextY);
      const updated = { ...fsm.draft, t2: pt.time, p2: pt.price };
      fsm.draft = updated;
      setDraft(updated);
    }
  };

  const handleDrawTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeTool === 'cursor') return;
    e.stopPropagation();
    const fsm = fsmRef.current;
    if (fsm.moved) return;

    const coords = getCoords();
    if (!coords) return;
    const pt = coords.xyToData(fsm.cursorX, fsm.cursorY);

    if (activeTool === 'hline') {
      const item: DrawingItem = {
        id: `drw_${Date.now()}`, type: 'hline', symbol, locked: false,
        t1: pt.time, p1: pt.price, t2: pt.time + coords.step * 20, p2: pt.price,
        color: '#2962ff', lineWidth: 2, extendRight: true,
      };
      onAddDrawing(item);
      onSelectDrawing(item.id);
      onFinishTool();
      return;
    }

    if (activeTool === 'long' || activeTool === 'short') {
      const span = Math.abs(coords.lastBar.high - coords.lastBar.low) * 1.5 || pt.price * 0.01;
      const sl = activeTool === 'long' ? pt.price - span : pt.price + span;
      const tp = activeTool === 'long' ? pt.price + span * 2 : pt.price - span * 2;
      const item: DrawingItem = {
        id: `drw_${Date.now()}`, type: activeTool, symbol, locked: false,
        t1: pt.time, p1: pt.price, t2: pt.time + coords.step * 16, p2: sl, p3: tp,
        color: activeTool === 'long' ? '#089981' : '#f23645', lineWidth: 1,
        posConfig: { ...defaultPosConfig },
      };
      onAddDrawing(item);
      onSelectDrawing(item.id);
      onFinishTool();
      return;
    }

    if (activeTool === 'text') {
      const txt = prompt('請輸入標註文字：', 'BSL');
      if (txt && txt.trim()) {
        const item: DrawingItem = {
          id: `drw_${Date.now()}`, type: 'text', symbol, locked: false,
          t1: pt.time, p1: pt.price, t2: pt.time, p2: pt.price,
          text: txt.trim(), fontSize: 13, color: '#ffffff', bgColor: 'rgba(30, 34, 45, 0.88)', lineWidth: 1,
        };
        onAddDrawing(item);
        onSelectDrawing(item.id);
      }
      onFinishTool();
      return;
    }

    // 路徑工具（Path）：每次輕點都新增一個折線節點
    if (activeTool === 'path') {
      if (!fsm.draft) {
        const newPath: DrawingItem = {
          id: `drw_${Date.now()}`, type: 'path', symbol, locked: false,
          t1: pt.time, p1: pt.price, t2: pt.time, p2: pt.price,
          points: [pt], arrowEnd: true, color: '#facc15', lineWidth: 2,
        };
        fsm.phase = 'AIM_P2';
        fsm.draft = newPath;
        setDraft(newPath);
        onPathPointsCountChange?.(1);
      } else {
        const nextPts = [...(fsm.draft.points || []), pt];
        const updated: DrawingItem = { ...fsm.draft, points: nextPts, t2: pt.time, p2: pt.price };
        fsm.draft = updated;
        setDraft(updated);
        onPathPointsCountChange?.(nextPts.length);
      }
      return;
    }

    if (fsm.phase === 'AIM_P1') {
      const newDraft: DrawingItem = {
        id: `drw_${Date.now()}`,
        type: activeTool as any,
        symbol,
        locked: false,
        t1: pt.time, p1: pt.price, t2: pt.time, p2: pt.price,
        color: activeTool === 'rect' ? '#2962ff' : '#787b86',
        fillColor: activeTool === 'rect' ? 'rgba(41, 98, 255, 0.16)' : undefined,
        lineWidth: 2,
        fiboLevels: activeTool === 'fibo' ? JSON.parse(JSON.stringify(defaultFiboLevels)) : undefined,
      };
      fsm.phase = 'AIM_P2';
      fsm.draft = newDraft;
      setDraft(newDraft);
    } else if (fsm.phase === 'AIM_P2' && fsm.draft) {
      const finished: DrawingItem = { ...fsm.draft, t2: pt.time, p2: pt.price };
      fsm.phase = 'AIM_P1';
      fsm.draft = null;
      setDraft(null);
      onAddDrawing(finished);
      onSelectDrawing(finished.id);
      onFinishTool();
    }
  };

  return (
    <div
      ref={wrapperRef}
      onTouchStart={activeTool !== 'cursor' ? handleDrawTouchStart : undefined}
      onTouchMove={activeTool !== 'cursor' ? handleDrawTouchMove : undefined}
      onTouchEnd={activeTool !== 'cursor' ? handleDrawTouchEnd : undefined}
      className={`absolute inset-0 z-10 ${activeTool !== 'cursor' ? 'pointer-events-auto touch-none' : 'pointer-events-none'}`}
    >
      <canvas ref={canvasRef} className="pointer-events-none w-full h-full" />
    </div>
  );
};
