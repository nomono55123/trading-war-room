import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Eye, EyeOff, Plus, Trash2, Code2, Play, Pause, Layers,
  PanelRightClose, PanelRightOpen, X, Flag,
  MousePointer2, TrendingUp, Minus, Square, Percent, ArrowUpCircle, ArrowDownCircle,
  Bookmark, Settings2, BarChartHorizontal, Waypoints, Lock, Unlock,
  Type, Scissors, StepForward, Shuffle
} from 'lucide-react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  ChartCanvas,
  DEFAULT_FIBO_LEVELS,
  DEFAULT_POS_CONFIG,
  DEFAULT_FRVP_CONFIG,
  type DrawingItem,
  type DrawingToolType,
  type FiboLevel,
  type PositionConfig,
  type FrvpConfig,
} from './ChartCanvas';
import { DEFAULT_INDICATORS, DEFAULT_MULTILEVEL_CONFIG, runIndicatorScript, type IndicatorOutput, type IndicatorScript } from './indicatorEngine';
import { TIMEFRAMES, useMarketData, type TimeframeOption } from './useMarketData';
import { FLAG_DEFS, WatchlistPanel, type FlagColor } from './WatchlistPanel';
import { DrawingSettingsModal } from './DrawingSettingsModal';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';
import { TopbarCountdownBadge, PriceAxisCountdownTag } from './CandleCountdownBadge';

interface DrawingTemplate {
  id: string;
  name: string;
  targetType: 'fibo' | 'rect' | 'trendline' | 'frvp' | 'path' | 'text';
  color: string;
  fillColor?: string;
  dashed?: boolean;
  extendRight?: boolean;
  arrowEnd?: boolean;
  fiboLevels?: FiboLevel[];
  frvpConfig?: FrvpConfig;
}

const DEFAULT_TEMPLATES: DrawingTemplate[] = [
  { id: 'tpl_kuang', name: '框法', targetType: 'rect', color: '#2962ff', fillColor: 'rgba(41, 98, 255, 0.18)' },
  { id: 'tpl_poi', name: 'POI', targetType: 'rect', color: '#9c27b0', fillColor: 'rgba(156, 39, 176, 0.20)' },
  { id: 'tpl_sweep', name: 'Sweep', targetType: 'trendline', color: '#ff9800', dashed: true },
  { id: 'tpl_fibo_std', name: 'fibo (預設)', targetType: 'fibo', color: '#787b86', fiboLevels: DEFAULT_FIBO_LEVELS },
  { id: 'tpl_ote', name: 'OTE (0.618 - 0.79)', targetType: 'fibo', color: '#2962ff', fiboLevels: DEFAULT_FIBO_LEVELS.map((lv) => ({ ...lv, enabled: [0, 0.5, 0.618, 0.705, 0.79, 1].includes(lv.value) })) },
  { id: 'tpl_frvp_200', name: 'FRVP (200行 / 70%)', targetType: 'frvp', color: '#00bcd4', frvpConfig: DEFAULT_FRVP_CONFIG },
];

function loadInitialIndicators(): IndicatorScript[] {
  try {
    const raw = localStorage.getItem('warroom_indicators_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: IndicatorScript) =>
          item.id === 'ind_structure_v6' && !item.uiType
            ? { ...item, uiType: 'multilevel', multiLevelConfig: DEFAULT_MULTILEVEL_CONFIG }
            : item
        );
      }
    }
  } catch {}
  return DEFAULT_INDICATORS;
}

export function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState<TimeframeOption>(TIMEFRAMES.find((t) => t.label === '15分') || TIMEFRAMES[0]);
  const [replaySelecting, setReplaySelecting] = useState(false);
  const [replayCutoffTime, setReplayCutoffTime] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeedMs, setReplaySpeedMs] = useState(600);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const { allSymbols, bars, barsHTF, mtfBarsMap, loadingAllHistory, tickersMap, refreshingPairs, fetchAllSymbols, loadMoreHistory, loadAllHistory, fetch3dPool } = useMarketData(symbol, tf, replayCutoffTime);

  const [activeTool, setActiveTool] = useState<DrawingToolType>('cursor');
  const [drawings, setDrawings] = useState<DrawingItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('warroom_drawings_v1') || '[]'); } catch { return []; }
  });
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [tplMenuOpen, setTplMenuOpen] = useState(false);
  const [templates, setTemplates] = useState<DrawingTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('warroom_templates_v1');
      if (saved) {
        const p = JSON.parse(saved);
        if (Array.isArray(p) && p.length > 0) return p;
      }
    } catch {}
    return DEFAULT_TEMPLATES;
  });
  const [defaultFiboLevels, setDefaultFiboLevels] = useState<FiboLevel[]>(DEFAULT_FIBO_LEVELS);
  const [defaultPosConfig, setDefaultPosConfig] = useState<PositionConfig>(() => {
    try {
      const saved = localStorage.getItem('warroom_poscfg_v1');
      return saved ? JSON.parse(saved) : DEFAULT_POS_CONFIG;
    } catch { return DEFAULT_POS_CONFIG; }
  });
  const [defaultFrvpConfig, setDefaultFrvpConfig] = useState<FrvpConfig>(DEFAULT_FRVP_CONFIG);

  const [flagsMap, setFlagsMap] = useState<Record<string, FlagColor>>(() => {
    try {
      const saved = localStorage.getItem('warroom_flags_v1');
      return saved ? JSON.parse(saved) : { BTCUSDT: 'red', ETHUSDT: 'red' };
    } catch { return { BTCUSDT: 'red', ETHUSDT: 'red' }; }
  });
  const [wlOpen, setWlOpen] = useState(true);

  const [indicators, setIndicators] = useState<IndicatorScript[]>(loadInitialIndicators);
  const [activeEditId, setActiveEditId] = useState<string>(() => loadInitialIndicators()[0]?.id || '');
  const [editorOpen, setEditorOpen] = useState(false);
  const [indSettingsId, setIndSettingsId] = useState<string | null>(null);
  const [indPanelCollapsed, setIndPanelCollapsed] = useState<boolean>(() => localStorage.getItem('warroom_ind_collapsed') === '1');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (indicators.length === 0) {
      setIndicators(DEFAULT_INDICATORS);
      setActiveEditId(DEFAULT_INDICATORS[0].id);
      return;
    }
    if (!indicators.some((i) => i.id === activeEditId)) {
      setActiveEditId(indicators[0].id);
    }
    localStorage.setItem('warroom_indicators_v2', JSON.stringify(indicators));
  }, [indicators, activeEditId]);

  useEffect(() => { localStorage.setItem('warroom_flags_v1', JSON.stringify(flagsMap)); }, [flagsMap]);
  useEffect(() => { localStorage.setItem('warroom_drawings_v1', JSON.stringify(drawings)); }, [drawings]);
  useEffect(() => { localStorage.setItem('warroom_templates_v1', JSON.stringify(templates)); }, [templates]);
  useEffect(() => { localStorage.setItem('warroom_poscfg_v1', JSON.stringify(defaultPosConfig)); }, [defaultPosConfig]);

  useEffect(() => {
    setReplaySelecting(false);
    setReplayCutoffTime(null);
    setReplayPlaying(false);
  }, [symbol]);

  useEffect(() => {
    setReplaySelecting(false);
    setReplayPlaying(false);
  }, [tf]);

  const visibleBars = useMemo(() => {
    if (replayCutoffTime === null) return bars;
    const sliced = bars.filter((b) => b.time <= replayCutoffTime);
    return sliced.length > 0 ? sliced : bars.slice(0, Math.min(20, bars.length));
  }, [bars, replayCutoffTime]);

  const visibleBarsHTF = useMemo(() => {
    if (replayCutoffTime === null) return barsHTF;
    return barsHTF.filter((b) => b.time <= replayCutoffTime);
  }, [barsHTF, replayCutoffTime]);

  const visibleMtfMap = useMemo(() => {
    if (replayCutoffTime === null) return mtfBarsMap;
    const slicedMap: Record<string, typeof bars> = {};
    for (const [k, list] of Object.entries(mtfBarsMap)) {
      slicedMap[k] = list.filter((b) => b.time <= replayCutoffTime);
    }
    return slicedMap;
  }, [mtfBarsMap, replayCutoffTime]);

  const used3dIndicesRef = useRef<number[]>([]);
  const handleRandomReplay = useCallback(async () => {
    const pool3d = await fetch3dPool(symbol);
    if (pool3d.length < 25) return;

    const minIdx = Math.min(20, Math.floor(pool3d.length * 0.1));
    const maxIdx = Math.max(minIdx + 1, pool3d.length - 8);
    const totalCandidates = maxIdx - minIdx;

    let candidates = Array.from({ length: totalCandidates }, (_, i) => minIdx + i)
      .filter((idx) => !used3dIndicesRef.current.includes(idx));
    if (candidates.length === 0) {
      used3dIndicesRef.current = [];
      candidates = Array.from({ length: totalCandidates }, (_, i) => minIdx + i);
    }

    const pickedIdx = candidates[Math.floor(Math.random() * candidates.length)];
    used3dIndicesRef.current = [...used3dIndicesRef.current.slice(-29), pickedIdx];

    const base3dTime = pool3d[pickedIdx].time;
    const maxOffset = Math.max(0, 259200 - tf.sec);
    const rawOffset = maxOffset > 0 ? Math.floor(Math.random() * maxOffset) : 0;
    const alignedOffset = Math.floor(rawOffset / tf.sec) * tf.sec;
    const nowSec = Math.floor((Date.now() - tf.sec * 30 * 1000) / 1000);
    const rawAnchor = Math.min(nowSec, base3dTime + alignedOffset);
    const finalAnchorTime = Math.floor(rawAnchor / tf.sec) * tf.sec;

    setActiveTool('cursor');
    setReplaySelecting(false);
    setReplayPlaying(false);
    setReplayCutoffTime(finalAnchorTime);
    setTimeout(() => {
      chartRef.current?.timeScale().scrollToRealTime();
    }, 80);
  }, [symbol, tf.sec, fetch3dPool]);

  const stepReplayForward = useCallback(() => {
    if (replayCutoffTime === null || bars.length === 0) return;
    const nextBar = bars.find((b) => b.time > replayCutoffTime);
    if (nextBar) {
      setReplayCutoffTime(nextBar.time);
    } else {
      setReplayPlaying(false);
      setReplayCutoffTime(null);
    }
  }, [replayCutoffTime, bars]);

  useEffect(() => {
    if (!replayPlaying || replayCutoffTime === null) return;
    const timer = setInterval(stepReplayForward, replaySpeedMs);
    return () => clearInterval(timer);
  }, [replayPlaying, replayCutoffTime, replaySpeedMs, stepReplayForward]);

  const selectedDrawing = useMemo(() => drawings.find((d) => d.id === selectedDrawingId) || null, [drawings, selectedDrawingId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        if (selectedDrawing?.locked) return;
        setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
        setSettingsModalOpen(false);
      } else if (e.key === 'ArrowRight' && replayCutoffTime !== null) {
        e.preventDefault();
        stepReplayForward();
      } else if (e.key === 'Escape') {
        setActiveTool('cursor');
        setReplaySelecting(false);
        setSelectedDrawingId(null);
        setSettingsModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDrawingId, selectedDrawing, replayCutoffTime, stepReplayForward]);

  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => clearTimeout(t);
  }, [wlOpen, editorOpen]);

  const [indicatorOutputs, setIndicatorOutputs] = useState<IndicatorOutput[]>([]);
  const lastCalcTimeRef = useRef<number>(0);

  useEffect(() => {
    if (visibleBars.length === 0) { setIndicatorOutputs([]); return; }
    const now = Date.now();
    const delay = (replayCutoffTime !== null || now - lastCalcTimeRef.current >= 250) ? 0 : 250 - (now - lastCalcTimeRef.current);

    const timer = setTimeout(() => {
      lastCalcTimeRef.current = Date.now();
      const results: IndicatorOutput[] = [];
      let err = '';
      for (const ind of indicators) {
        if (!ind.enabled) continue;
        try {
          results.push(runIndicatorScript(ind, visibleBars, visibleBarsHTF, visibleMtfMap));
        } catch (e: any) {
          err = `[${ind.name}] 語法錯誤: ${e.message}`;
        }
      }
      setErrorMsg(err);
      setIndicatorOutputs(results);
    }, delay);

    return () => clearTimeout(timer);
  }, [visibleBars, visibleBarsHTF, visibleMtfMap, indicators, replayCutoffTime]);

  const handleUpdateDrawing = useCallback((updated: DrawingItem) => {
    setDrawings((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    if (updated.type === 'fibo' && updated.fiboLevels) setDefaultFiboLevels(updated.fiboLevels);
    if ((updated.type === 'long' || updated.type === 'short') && updated.posConfig) setDefaultPosConfig(updated.posConfig);
    if (updated.type === 'frvp' && updated.frvpConfig) setDefaultFrvpConfig(updated.frvpConfig);
  }, []);

  const handleSaveTemplate = () => {
    if (!selectedDrawing) return;
    const name = prompt('請輸入繪圖範本名稱：');
    if (!name?.trim()) return;
    setTemplates([...templates, {
      id: `tpl_${Date.now()}`,
      name: name.trim(),
      targetType: selectedDrawing.type === 'fibo' ? 'fibo' : selectedDrawing.type === 'rect' ? 'rect' : selectedDrawing.type === 'frvp' ? 'frvp' : selectedDrawing.type === 'path' ? 'path' : selectedDrawing.type === 'text' ? 'text' : 'trendline',
      color: selectedDrawing.color,
      fillColor: selectedDrawing.fillColor,
      dashed: selectedDrawing.dashed,
      extendRight: selectedDrawing.extendRight,
      arrowEnd: selectedDrawing.arrowEnd,
      fiboLevels: selectedDrawing.fiboLevels ? JSON.parse(JSON.stringify(selectedDrawing.fiboLevels)) : undefined,
      frvpConfig: selectedDrawing.frvpConfig ? { ...selectedDrawing.frvpConfig } : undefined,
    }]);
    setTplMenuOpen(false);
  };

  const handleApplyTemplate = (tpl: DrawingTemplate) => {
    if (!selectedDrawing) return;
    handleUpdateDrawing({
      ...selectedDrawing,
      color: tpl.color,
      fillColor: tpl.fillColor ?? selectedDrawing.fillColor,
      dashed: tpl.dashed ?? selectedDrawing.dashed,
      extendRight: tpl.extendRight ?? selectedDrawing.extendRight,
      arrowEnd: tpl.arrowEnd ?? selectedDrawing.arrowEnd,
      fiboLevels: tpl.fiboLevels ? JSON.parse(JSON.stringify(tpl.fiboLevels)) : selectedDrawing.fiboLevels,
      frvpConfig: tpl.frvpConfig ? { ...tpl.frvpConfig } : selectedDrawing.frvpConfig,
    });
    setTplMenuOpen(false);
  };

  const handleToggleRedFlag = useCallback((e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    setFlagsMap((prev) => {
      const next = { ...prev };
      if (next[sym]) delete next[sym];
      else next[sym] = 'red';
      return next;
    });
  }, []);

  const handleSetFlagColor = useCallback((sym: string, color: FlagColor | null) => {
    setFlagsMap((prev) => {
      const next = { ...prev };
      if (color === null) delete next[sym];
      else next[sym] = color;
      return next;
    });
  }, []);

  const activeScript = indicators.find((i) => i.id === activeEditId);
  const curTicker = tickersMap[symbol];
  const curFlagHex = FLAG_DEFS.find((f) => f.id === flagsMap[symbol])?.hex;

  const getDrawingTitle = (type: DrawingItem['type']) => {
    if (type === 'text') return '文字標註';
    if (type === 'frvp') return '固定範圍成交量 (FRVP)';
    if (type === 'path') return '路徑 (Path)';
    if (type === 'fibo') return '斐波那契';
    if (type === 'long') return '多頭倉位';
    if (type === 'short') return '空頭倉位';
    if (type === 'rect') return '矩形框';
    return '線段';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#131722] text-[#d1d4dc] select-none overflow-hidden">
      <header className="flex items-center justify-between h-11 px-3 border-b border-[#2a2e39] bg-[#1e222d] gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-bold text-white tracking-wide shrink-0">WAR ROOM</span>
          <div className="flex items-center gap-1.5 bg-[#2a2e39] px-2.5 py-1 rounded text-xs shrink-0">
            <button onClick={(e) => handleToggleRedFlag(e, symbol)} className="cursor-pointer hover:scale-110">
              <Flag size={13} style={{ color: curFlagHex || '#787b86', fill: curFlagHex || 'transparent' }} />
            </button>
            <span className="font-bold text-white">{symbol}.P</span>
            <TopbarCountdownBadge lastBar={visibleBars[visibleBars.length - 1]} tf={tf} hidden={replayCutoffTime !== null} />
            {curTicker && (
              <span className={curTicker.priceChangePercent >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
                {curTicker.priceChangePercent >= 0 ? '+' : ''}{curTicker.priceChangePercent.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 border-l border-[#2a2e39] pl-2 overflow-x-auto no-scrollbar">
            {TIMEFRAMES.map((t) => (
              <button key={t.label} onClick={() => setTf(t)} className={`px-2 py-1 text-xs rounded shrink-0 cursor-pointer ${tf.label === t.label ? 'bg-[#2962ff] text-white font-semibold' : 'hover:bg-[#2a2e39]'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border-l border-[#2a2e39] pl-2 ml-1 shrink-0">
            <button
              onClick={() => {
                if (replayCutoffTime !== null || replaySelecting) {
                  setReplaySelecting(false);
                  setReplayCutoffTime(null);
                  setReplayPlaying(false);
                } else {
                  setActiveTool('cursor');
                  setReplaySelecting(true);
                }
              }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer ${
                replayCutoffTime !== null || replaySelecting ? 'bg-[#2962ff] text-white font-semibold' : 'bg-[#2a2e39] hover:bg-[#363a45]'
              }`}
              title="手動選擇切斷點開始回放"
            >
              <Scissors size={13} /> <span>回放</span>
            </button>
            <button
              onClick={handleRandomReplay}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#facc15] cursor-pointer"
              title="隨機抽取歷史時間錨點盲測 (切換週期也會鎖定在同時間)"
            >
              <Shuffle size={12} /> <span>隨機K</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-[#2a2e39] pl-2 shrink-0">
            <button
              onClick={loadAllHistory}
              className={`text-[11px] px-2 py-0.5 rounded cursor-pointer border ${
                loadingAllHistory
                  ? 'bg-[#ff9800]/20 border-[#ff9800] text-[#ff9800] animate-pulse font-semibold'
                  : 'bg-[#2a2e39] border-transparent hover:bg-[#363a45] text-[#d1d4dc]'
              }`}
              title="背景連續抓滿該週期所有歷史 K 線直到上市首日（再點一次可停止）"
            >
              {loadingAllHistory ? `載入中 (${visibleBars.length}K)...` : `${visibleBars.length}K · 載入全部`}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              const id = `ind_${Date.now()}`;
              setIndicators([...indicators, { id, name: `自訂指標 #${indicators.length + 1}`, enabled: true, code: `sdk.plotEMA(13, '#e91e63', 2);` }]);
              setActiveEditId(id);
              setEditorOpen(true);
            }}
            className="flex items-center gap-1 bg-[#2a2e39] hover:bg-[#363a45] text-xs px-2.5 py-1.5 rounded cursor-pointer"
          >
            <Plus size={14} /> 新增指標
          </button>
          <button onClick={() => setEditorOpen(!editorOpen)} className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded cursor-pointer ${editorOpen ? 'bg-[#2962ff] text-white' : 'bg-[#2a2e39] hover:bg-[#363a45]'}`}>
            <Code2 size={14} /> 編輯器
          </button>
          <button onClick={() => setWlOpen(!wlOpen)} className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded cursor-pointer ${wlOpen ? 'bg-[#2962ff] text-white' : 'bg-[#2a2e39] hover:bg-[#363a45]'}`}>
            {wlOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-11 bg-[#1e222d] border-r border-[#2a2e39] flex flex-col items-center py-2 gap-1.5 shrink-0 z-20">
          {[
            { id: 'cursor', icon: MousePointer2, label: '十字游標 (Esc)' },
            { id: 'trendline', icon: TrendingUp, label: '趨勢線' },
            { id: 'hline', icon: Minus, label: '水平線' },
            { id: 'path', icon: Waypoints, label: '路徑 Path (連續點擊畫折線，雙擊或右鍵完成)' },
            { id: 'rect', icon: Square, label: '矩形框 / POI' },
            { id: 'text', icon: Type, label: '文字標註 (Text / 筆記標籤)' },
            { id: 'fibo', icon: Percent, label: '斐波那契回撤' },
            { id: 'frvp', icon: BarChartHorizontal, label: '固定範圍成交量分佈圖 (FRVP)' },
            { id: 'long', icon: ArrowUpCircle, label: '多頭倉位 (算顆數)' },
            { id: 'short', icon: ArrowDownCircle, label: '空頭倉位 (算顆數)' },
          ].map((tool) => {
            const Icon = tool.icon;
            return (
              <button key={tool.id} onClick={() => setActiveTool(tool.id as DrawingToolType)} className={`p-2 rounded cursor-pointer ${activeTool === tool.id ? 'bg-[#2962ff] text-white' : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-white'}`} title={tool.label}>
                <Icon size={17} />
              </button>
            );
          })}
          <button onClick={() => { if (confirm(`清除 ${symbol}.P 所有未鎖定的繪圖？`)) { setDrawings(drawings.filter((d) => d.symbol !== symbol || d.locked)); setSelectedDrawingId(null); } }} className="p-2 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#ef5350] cursor-pointer mt-auto" title="清除未鎖定繪圖">
            <Trash2 size={17} />
          </button>
        </aside>

        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="relative flex-1 min-h-0">
            <PriceAxisCountdownTag
              chartRef={chartRef}
              candleSeriesRef={candleSeriesRef}
              lastBar={visibleBars[visibleBars.length - 1]}
              tf={tf}
              hidden={replayCutoffTime !== null}
            />

            {replaySelecting && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#2962ff] text-white text-xs px-3.5 py-1.5 rounded-md shadow-xl font-semibold">
                ✂️ 請點擊圖表上任意一根歷史 K 棒作為回放起點 (按 Esc 取消)
              </div>
            )}

            {replayCutoffTime !== null && !replaySelecting && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-[#1e222d]/95 backdrop-blur border border-[#2962ff] rounded-full px-4 py-1.5 shadow-2xl text-xs">
                <span className="text-[#2962ff] font-bold">回放鎖定中</span>
                <button
                  onClick={() => setReplayPlaying(!replayPlaying)}
                  className="flex items-center gap-1 bg-[#2962ff] hover:bg-[#1e53e5] text-white px-2.5 py-1 rounded-full cursor-pointer font-semibold"
                >
                  {replayPlaying ? <><Pause size={13} /> 暫停</> : <><Play size={13} /> 播放</>}
                </button>
                <button
                  onClick={stepReplayForward}
                  className="flex items-center gap-1 bg-[#2a2e39] hover:bg-[#363a45] text-white px-2.5 py-1 rounded-full cursor-pointer"
                  title="前進一根 K 棒 (鍵盤 →)"
                >
                  <StepForward size={13} /> 下一根
                </button>
                <select
                  value={replaySpeedMs}
                  onChange={(e) => setReplaySpeedMs(Number(e.target.value))}
                  className="bg-[#131722] text-white px-2 py-1 rounded-full border border-[#2a2e39] outline-none cursor-pointer"
                >
                  <option value={1200}>1x 慢速</option>
                  <option value={600}>2x 正常</option>
                  <option value={250}>5x 快速</option>
                </select>
                <button
                  onClick={handleRandomReplay}
                  className="flex items-center gap-1 text-[#facc15] hover:underline cursor-pointer px-1"
                  title="隨機切換到另一個歷史位置盲測"
                >
                  <Shuffle size={12} /> 隨機K
                </button>
                <button
                  onClick={() => { setReplayPlaying(false); setReplaySelecting(true); }}
                  className="text-[#787b86] hover:text-white cursor-pointer px-1"
                  title="重新手動選擇切斷位置"
                >
                  重切
                </button>
                <button
                  onClick={() => { setReplayPlaying(false); setReplayCutoffTime(null); }}
                  className="text-[#ef5350] hover:underline cursor-pointer pl-1 border-l border-[#2a2e39]"
                >
                  退出回放
                </button>
              </div>
            )}

            {activeTool === 'path' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#2962ff] text-white text-xs px-3 py-1 rounded shadow-lg">
                路徑繪製中：左鍵連續點擊添加轉折點，雙擊或按右鍵結束
              </div>
            )}

            {selectedDrawing && activeTool === 'cursor' && !replaySelecting && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#1e222d] border border-[#363a45] rounded-md px-3 py-1.5 shadow-xl text-xs">
                <span className="font-semibold text-white">{getDrawingTitle(selectedDrawing.type)}</span>

                <button
                  onClick={() => handleUpdateDrawing({ ...selectedDrawing, locked: !selectedDrawing.locked })}
                  className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer ${
                    selectedDrawing.locked ? 'bg-[#ff9800]/25 text-[#ff9800]' : 'bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc]'
                  }`}
                  title={selectedDrawing.locked ? '點擊解除鎖定' : '點擊固定位置 (防止誤拖)'}
                >
                  {selectedDrawing.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>

                {!['long', 'short', 'frvp'].includes(selectedDrawing.type) && (
                  <input type="color" value={selectedDrawing.color} onChange={(e) => handleUpdateDrawing({ ...selectedDrawing, color: e.target.value, fillColor: selectedDrawing.type === 'rect' ? `${e.target.value}2e` : undefined })} className="w-5 h-5 bg-transparent border-0 cursor-pointer" />
                )}

                <div className="relative">
                  <button onClick={() => setTplMenuOpen(!tplMenuOpen)} className="flex items-center gap-1 bg-[#2a2e39] hover:bg-[#363a45] px-2 py-1 rounded text-white cursor-pointer">
                    <Bookmark size={12} /> <span>範本</span>
                  </button>
                  {tplMenuOpen && (
                    <div className="absolute left-0 mt-1 w-44 bg-[#1e222d] border border-[#363a45] rounded shadow-xl py-1 z-50">
                      <button onClick={handleSaveTemplate} className="w-full text-left px-3 py-1.5 text-xs text-[#2962ff] hover:bg-[#2a2e39] font-semibold cursor-pointer">儲存繪圖範本為...</button>
                      <div className="border-t border-[#2a2e39] my-1" />
                      {templates.map((tpl) => (
                        <div key={tpl.id} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#2a2e39] cursor-pointer">
                          <span onClick={() => handleApplyTemplate(tpl)} className="flex-1 text-white">{tpl.name}</span>
                          <button onClick={() => setTemplates(templates.filter((t) => t.id !== tpl.id))} className="text-[#787b86] hover:text-[#ef5350]"><X size={11} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={() => setSettingsModalOpen(true)} className="flex items-center gap-1 bg-[#2962ff] hover:bg-[#1e53e5] text-white px-2.5 py-1 rounded cursor-pointer">
                  <Settings2 size={12} /> <span>設定</span>
                </button>

                {!selectedDrawing.locked && (
                  <button onClick={() => { setDrawings(drawings.filter((d) => d.id !== selectedDrawing.id)); setSelectedDrawingId(null); setSettingsModalOpen(false); }} className="text-[#787b86] hover:text-[#ef5350] p-1 cursor-pointer" title="刪除">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}

            {settingsModalOpen && selectedDrawing && (
              <DrawingSettingsModal
                drawing={selectedDrawing}
                symbol={symbol}
                onUpdate={handleUpdateDrawing}
                onSaveTemplate={handleSaveTemplate}
                onClose={() => setSettingsModalOpen(false)}
              />
            )}

            <div className={`absolute top-3 left-3 z-20 flex flex-col gap-1 bg-[#131722]/85 backdrop-blur-sm border border-[#2a2e39] rounded text-xs transition-all ${indPanelCollapsed ? 'px-2.5 py-1.5' : 'p-2 max-w-[300px]'}`}>
              <div
                onClick={() => {
                  const next = !indPanelCollapsed;
                  setIndPanelCollapsed(next);
                  localStorage.setItem('warroom_ind_collapsed', next ? '1' : '0');
                }}
                className={`flex items-center justify-between gap-3 text-[#787b86] hover:text-white text-[11px] cursor-pointer select-none ${indPanelCollapsed ? '' : 'pb-1 border-b border-[#2a2e39]/60'}`}
                title={indPanelCollapsed ? '展開指標列表' : '收合指標列表'}
              >
                <span className="flex items-center gap-1">
                  <Layers size={12} />
                  {indPanelCollapsed ? `指標 (${indicators.filter((i) => i.enabled).length})` : `已掛載指標 (${indicators.filter((i) => i.enabled).length}/${indicators.length})`}
                </span>
                <span className="text-[10px] leading-none">{indPanelCollapsed ? '▼' : '▲'}</span>
              </div>

              {!indPanelCollapsed && indicators.map((ind) => (
                <div
                  key={ind.id}
                  onClick={() => setActiveEditId(ind.id)}
                  onDoubleClick={() => {
                    if (ind.uiType === 'multilevel') setIndSettingsId(ind.id);
                    else setEditorOpen(true);
                  }}
                  className={`flex items-center justify-between gap-3 px-2 py-1 rounded cursor-pointer ${activeEditId === ind.id ? 'bg-[#2a2e39] text-white' : 'hover:bg-[#2a2e39]/50'}`}
                >
                  <span className="truncate">{ind.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ind.uiType === 'multilevel') {
                          setIndSettingsId(indSettingsId === ind.id ? null : ind.id);
                        } else {
                          setActiveEditId(ind.id);
                          setEditorOpen(true);
                        }
                      }}
                      className="text-[#787b86] hover:text-white cursor-pointer"
                      title="指標參數設定"
                    >
                      <Settings2 size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIndicators(indicators.map((i) => (i.id === ind.id ? { ...i, enabled: !i.enabled } : i))); }} className="hover:text-white cursor-pointer" title="顯示/隱藏">
                      {ind.enabled ? <Eye size={13} className="text-[#4caf50]" /> : <EyeOff size={13} className="text-[#787b86]" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIndicators(indicators.filter((i) => i.id !== ind.id)); }} className="hover:text-[#ef5350] cursor-pointer" title="移除指標">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {indSettingsId && (() => {
              const targetInd = indicators.find((i) => i.id === indSettingsId);
              if (!targetInd) return null;
              return (
                <IndicatorSettingsModal
                  script={targetInd}
                  onUpdate={(updated) => setIndicators(indicators.map((i) => (i.id === updated.id ? updated : i)))}
                  onClose={() => setIndSettingsId(null)}
                />
              );
            })()}

            <ChartCanvas
              bars={visibleBars}
              outputs={indicatorOutputs}
              symbol={symbol}
              activeTool={activeTool}
              magnetEnabled={false}
              replaySelecting={replaySelecting}
              onSelectReplayTime={(t) => {
                setReplaySelecting(false);
                setReplayCutoffTime(t);
              }}
              drawings={drawings}
              selectedDrawingId={selectedDrawingId}
              onSelectDrawing={setSelectedDrawingId}
              onAddDrawing={(d) => setDrawings((prev) => [...prev, d])}
              onUpdateDrawing={handleUpdateDrawing}
              onDoubleClickDrawing={(d) => { setSelectedDrawingId(d.id); setSettingsModalOpen(true); }}
              onFinishTool={() => setActiveTool('cursor')}
              defaultFiboLevels={defaultFiboLevels}
              defaultPosConfig={defaultPosConfig}
              defaultFrvpConfig={defaultFrvpConfig}
              onLoadMoreHistory={loadMoreHistory}
              externalChartRef={chartRef}
              externalCandleSeriesRef={candleSeriesRef}
            />
          </div>

          {editorOpen && activeScript && (
            <div className="h-52 border-t border-[#2a2e39] bg-[#1e222d] flex flex-col shrink-0">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2a2e39] text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[#787b86]">正在編輯：</span>
                  <input value={activeScript.name} onChange={(e) => setIndicators(indicators.map((i) => (i.id === activeScript.id ? { ...i, name: e.target.value } : i)))} className="bg-[#131722] text-white px-2 py-0.5 rounded border border-[#2a2e39] outline-none" />
                  {errorMsg && <span className="text-[#ef5350] ml-2">{errorMsg}</span>}
                </div>
                <span className="flex items-center gap-1 text-[#4caf50]"><Play size={12} /> 即時編譯渲染中</span>
              </div>
              <textarea value={activeScript.code} onChange={(e) => setIndicators(indicators.map((i) => (i.id === activeScript.id ? { ...i, code: e.target.value } : i)))} spellCheck={false} className="flex-1 w-full bg-[#131722] text-[#d1d4dc] font-mono text-xs p-3 outline-none resize-none" />
            </div>
          )}
        </div>

        {wlOpen && (
          <WatchlistPanel
            symbol={symbol}
            onSelectSymbol={setSymbol}
            allSymbols={allSymbols}
            tickersMap={tickersMap}
            flagsMap={flagsMap}
            onToggleRedFlag={handleToggleRedFlag}
            onSetFlagColor={handleSetFlagColor}
            refreshingPairs={refreshingPairs}
            onRefreshPairs={fetchAllSymbols}
          />
        )}
      </div>
    </div>
  );
}

export default App;
