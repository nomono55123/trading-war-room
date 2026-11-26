import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown, Pencil, Layers, List, CandlestickChart, X,
  Eye, EyeOff, Settings2, Trash2, Lock, Unlock, Download, Bookmark,
  Search, Star,
} from 'lucide-react';
import {
  ChartCanvas,
  type DrawingItem,
  type DrawingToolType,
} from './ChartCanvas';
import { MobileChartOverlay } from './MobileChartOverlay';
import { TvToolIcon } from './TvToolIcons';
import { WatchlistPanel } from './WatchlistPanel';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';
import { DrawingSettingsModal } from './DrawingSettingsModal';
import { PriceAxisCountdownTag } from './CandleCountdownBadge';
import type { IndicatorScript } from './indicatorEngine';
import type { TimeframeOption } from './useMarketData';

interface MobileToolMeta {
  id: DrawingToolType;
  label: string;
  category: '線段與路徑' | '區域與預測';
}

const ALL_MOBILE_TOOLS: MobileToolMeta[] = [
  { id: 'cursor', label: '游標', category: '線段與路徑' },
  { id: 'trendline', label: '趨勢線', category: '線段與路徑' },
  { id: 'hline', label: '水平線', category: '線段與路徑' },
  { id: 'path', label: '路徑', category: '線段與路徑' },
  { id: 'text', label: '文字', category: '線段與路徑' },
  { id: 'rect', label: '矩形', category: '區域與預測' },
  { id: 'fibo', label: '斐波那契', category: '區域與預測' },
  { id: 'frvp', label: '成交量分佈', category: '區域與預測' },
  { id: 'long', label: '多頭倉位', category: '區域與預測' },
  { id: 'short', label: '空頭倉位', category: '區域與預測' },
];

const DEFAULT_STARRED_TOOLS: DrawingToolType[] = ['trendline', 'hline', 'rect', 'fibo'];
const STAR_STORAGE_KEY = 'warroom_mobile_starred_tools_v1';

const getDrawingLabel = (type: DrawingItem['type']) => {
  const map: Record<string, string> = {
    text: '文字',
    frvp: 'FRVP',
    path: '路徑',
    fibo: '斐波那契',
    long: '多頭倉位',
    short: '空頭倉位',
    rect: '矩形',
    hline: '水平線',
  };
  return map[type] || '趨勢線';
};

export const MobileView: React.FC<any> = ({
  symbol,
  setSymbol,
  tf,
  setTf,
  timeframes,
  bars,
  outputs,
  indicators,
  setIndicators,
  indSettingsId,
  setIndSettingsId,
  activeTool,
  setActiveTool,
  drawings,
  setDrawings,
  selectedDrawingId,
  setSelectedDrawingId,
  handleUpdateDrawing,
  settingsModalOpen,
  setSettingsModalOpen,
  templates,
  setTemplates,
  handleSaveTemplate,
  handleApplyTemplate,
  defaultFiboLevels,
  defaultPosConfig,
  defaultFrvpConfig,
  loadMoreHistory,
  loadAllHistory,
  loadingAllHistory,
  chartRef,
  candleSeriesRef,
  allSymbols,
  tickersMap,
  flagsMap,
  handleToggleRedFlag,
  handleSetFlagColor,
  refreshingPairs,
  fetchAllSymbols,
}) => {
  const [tab, setTab] = useState<'chart' | 'watchlist'>('chart');
  const [tfSheetOpen, setTfSheetOpen] = useState(false);

  // 鉛筆：切換顯示/隱藏「常用繪圖」（只顯示有星號的工具）
  const [favBarOpen, setFavBarOpen] = useState(false);

  // 藍色塗層 ICON：開啟「繪圖工具箱」（搜尋 + 分類 + 點亮/取消星號）
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [toolCategory, setToolCategory] = useState<'全部' | '線段與路徑' | '區域與預測'>('全部');

  // 指標面板開關（獨立於繪圖工具）
  const [indPanelOpen, setIndPanelOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);

  const [starredTools, setStarredTools] = useState<DrawingToolType[]>(() => {
    try {
      const saved = localStorage.getItem(STAR_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((id: string) =>
            ALL_MOBILE_TOOLS.some((t) => t.id === id)
          ) as DrawingToolType[];
        }
      }
    } catch {}
    return DEFAULT_STARRED_TOOLS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify(starredTools));
    } catch {}
  }, [starredTools]);

  const toggleStarTool = (e: React.MouseEvent, toolId: DrawingToolType) => {
    e.stopPropagation();
    setStarredTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  const favoriteTools = useMemo(
    () => ALL_MOBILE_TOOLS.filter((t) => starredTools.includes(t.id)),
    [starredTools]
  );

  const filteredToolboxTools = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    return ALL_MOBILE_TOOLS.filter((t) => {
      const matchCat = toolCategory === '全部' || t.category === toolCategory;
      const matchQuery =
        !q || t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [toolSearch, toolCategory]);

  useEffect(() => {
    setTplOpen(false);
  }, [selectedDrawingId]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMoreHistory();
    }, 800);
    return () => clearTimeout(t);
  }, [symbol, tf.label]);

  const curTicker = tickersMap?.[symbol];
  const pct = curTicker ? Number(curTicker.priceChangePercent ?? 0) : 0;
  const lastPrice = curTicker?.lastPrice ?? '';
  const lastBar = bars && bars.length > 0 ? bars[bars.length - 1] : undefined;

  const targetInd = indSettingsId
    ? indicators.find((i: IndicatorScript) => i.id === indSettingsId)
    : null;
  const selectedDrawing = selectedDrawingId
    ? drawings.find((d: DrawingItem) => d.id === selectedDrawingId)
    : null;
  const activeToolInfo = ALL_MOBILE_TOOLS.find((t) => t.id === activeTool);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#131722] text-[#d1d4dc] overflow-hidden select-none">
      {/* 圖表主畫面 */}
      <div className={tab === 'chart' ? 'relative w-full h-full' : 'hidden'}>
        <ChartCanvas
          bars={bars}
          outputs={outputs}
          symbol={symbol}
          activeTool="cursor"
          magnetEnabled={false}
          replaySelecting={false}
          onSelectReplayTime={() => {}}
          drawings={drawings}
          selectedDrawingId={selectedDrawingId}
          onSelectDrawing={setSelectedDrawingId}
          onAddDrawing={(d) => setDrawings((prev: DrawingItem[]) => [...prev, d])}
          onUpdateDrawing={handleUpdateDrawing}
          onDoubleClickDrawing={() => {}}
          onFinishTool={() => setActiveTool('cursor')}
          defaultFiboLevels={defaultFiboLevels}
          defaultPosConfig={defaultPosConfig}
          defaultFrvpConfig={defaultFrvpConfig}
          onLoadMoreHistory={loadMoreHistory}
          externalChartRef={chartRef}
          externalCandleSeriesRef={candleSeriesRef}
        />

        <MobileChartOverlay
          chartRef={chartRef}
          candleSeriesRef={candleSeriesRef}
          bars={bars}
          symbol={symbol}
          activeTool={activeTool}
          drawings={drawings}
          selectedDrawingId={selectedDrawingId}
          onSelectDrawing={setSelectedDrawingId}
          onAddDrawing={(d) => setDrawings((prev: DrawingItem[]) => [...prev, d])}
          onUpdateDrawing={handleUpdateDrawing}
          onFinishTool={() => setActiveTool('cursor')}
          defaultFiboLevels={defaultFiboLevels}
          defaultPosConfig={defaultPosConfig}
        />

        <PriceAxisCountdownTag
          chartRef={chartRef}
          candleSeriesRef={candleSeriesRef}
          lastBar={lastBar}
          tf={tf}
        />

        {/* 左上角商品資訊 + 指標按鈕 + 畫線提示/編輯列 */}
        <div className="absolute top-3 left-3 z-30 flex flex-col items-start gap-2 pointer-events-none">
          <div className="bg-[#131722]/75 backdrop-blur-sm px-2 py-1 rounded-lg">
            <div className="text-sm font-bold text-white leading-tight">{symbol}</div>
            {lastPrice !== '' && (
              <div
                className={`text-xs font-mono font-semibold leading-tight mt-0.5 ${
                  pct >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'
                }`}
              >
                {lastPrice} ({pct >= 0 ? '+' : ''}
                {pct.toFixed(2)}%)
              </div>
            )}
          </div>

          <div className="pointer-events-auto">
            <button
              onClick={() => setIndPanelOpen((v) => !v)}
              className="flex items-center gap-1.5 bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-xl px-3.5 py-2 text-[13.5px] text-[#d1d4dc] shadow-lg active:scale-95 transition"
            >
              <Layers size={15} className="text-[#2962ff]" />
              <span className="font-semibold">
                指標 {indicators.filter((i: IndicatorScript) => i.enabled).length}
              </span>
              <ChevronDown
                size={15}
                className={`transition-transform ${indPanelOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {indPanelOpen && (
              <div className="mt-1.5 w-68 bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-xl p-2 shadow-2xl space-y-1.5">
                {indicators.map((ind: IndicatorScript) => (
                  <div
                    key={ind.id}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#131722]/90 text-[13px]"
                  >
                    <span className="truncate font-medium text-white pr-2">
                      {ind.name}
                    </span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        onClick={() => {
                          setIndSettingsId(ind.id);
                          setIndPanelOpen(false);
                        }}
                        className="p-1 text-[#9598a1] active:text-white"
                      >
                        <Settings2 size={15} />
                      </button>
                      <button
                        onClick={() =>
                          setIndicators((prev: IndicatorScript[]) =>
                            prev.map((item) =>
                              item.id === ind.id ? { ...item, enabled: !item.enabled } : item
                            )
                          )
                        }
                        className="p-1"
                      >
                        {ind.enabled ? (
                          <Eye size={15} className="text-[#26a69a]" />
                        ) : (
                          <EyeOff size={15} className="text-[#787b86]" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeTool !== 'cursor' && activeToolInfo && (
            <div className="pointer-events-auto flex items-center gap-2 bg-[#2962ff] text-white rounded-full px-3.5 py-1.5 shadow-xl text-xs whitespace-nowrap">
              <span className="font-semibold">
                {activeTool === 'path'
                  ? '路徑：點選添加轉折點，點兩下結束'
                  : `${activeToolInfo.label}：點第一下放起點，滑動再點一下完成`}
              </span>
              <button
                onClick={() => setActiveTool('cursor')}
                className="bg-black/25 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
              >
                取消
              </button>
            </div>
          )}

          {activeTool === 'cursor' && selectedDrawing && (
            <div className="pointer-events-auto flex items-center gap-1.5 bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-full px-3.5 py-1.5 shadow-2xl text-[13.5px] whitespace-nowrap">
              <span className="font-bold text-white pr-1">
                {getDrawingLabel(selectedDrawing.type)}
              </span>
              <div className="relative">
                <button
                  onClick={() => setTplOpen((v) => !v)}
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#2a2e39] text-white font-semibold active:opacity-80"
                >
                  <Bookmark size={14} className="text-[#facc15]" /> 範本
                </button>
                {tplOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-52 bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-xl shadow-2xl py-1.5 z-50 text-[13.5px]">
                    <button
                      onClick={() => {
                        handleSaveTemplate?.();
                        setTplOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-[#2962ff] font-bold active:bg-[#2a2e39]"
                    >
                      + 儲存目前樣式為範本...
                    </button>
                    <button
                      onClick={() => {
                        const raw = prompt('請貼上從電腦版匯出的範本 JSON 代碼：');
                        if (raw && raw.trim()) {
                          try {
                            const arr = JSON.parse(raw.trim());
                            if (Array.isArray(arr) && arr.length > 0) {
                              setTemplates?.(arr);
                              alert(`成功匯入 ${arr.length} 個範本！`);
                            }
                          } catch {
                            alert('格式錯誤，請確認完整複製代碼');
                          }
                        }
                        setTplOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-[#26a69a] font-semibold active:bg-[#2a2e39]"
                    >
                      ↓ 貼上代碼匯入電腦版範本...
                    </button>
                    <div className="border-t border-[#2a2e39] my-1" />
                    {(templates || []).map((tpl: any) => (
                      <div
                        key={tpl.id}
                        className="flex items-center justify-between px-3 py-2 active:bg-[#2a2e39]"
                      >
                        <button
                          onClick={() => {
                            handleApplyTemplate?.(tpl);
                            setTplOpen(false);
                          }}
                          className="flex-1 text-left text-white font-medium truncate pr-2"
                        >
                          {tpl.name}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTemplates?.((prev: any[]) =>
                              prev.filter((x) => x.id !== tpl.id)
                            );
                          }}
                          className="p-1 text-[#787b86] active:text-[#ef5350]"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#2962ff] text-white font-semibold active:opacity-80"
              >
                <Settings2 size={14} /> 設定
              </button>
              <button
                onClick={() =>
                  handleUpdateDrawing({
                    ...selectedDrawing,
                    locked: !selectedDrawing.locked,
                  })
                }
                className="p-1.5 rounded-full text-[#d1d4dc] active:bg-[#2a2e39]"
              >
                {selectedDrawing.locked ? (
                  <Lock size={16} className="text-[#ff9800]" />
                ) : (
                  <Unlock size={16} />
                )}
              </button>
              <button
                onClick={() => {
                  setDrawings((prev: DrawingItem[]) =>
                    prev.filter((d) => d.id !== selectedDrawing.id)
                  );
                  setSelectedDrawingId(null);
                }}
                className="p-1.5 rounded-full text-[#ef5350] active:bg-[#2a2e39]"
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={() => setSelectedDrawingId(null)}
                className="p-1.5 rounded-full text-[#9598a1]"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* 鉛筆按鈕叫出的「常用繪圖」浮動列：只顯示有加星號的工具 */}
        {favBarOpen && (
          <div className="absolute left-3 bottom-20 z-30 flex flex-col items-center gap-1.5 bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-2xl p-2 shadow-2xl">
            {favoriteTools.length > 0 ? (
              favoriteTools.map((t) => {
                const active = activeTool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTool(t.id);
                      setFavBarOpen(false);
                    }}
                    className={`relative p-2.5 rounded-xl transition ${
                      active
                        ? 'bg-[#2962ff] text-white shadow'
                        : 'text-[#d1d4dc] active:bg-[#2a2e39]'
                    }`}
                    title={t.label}
                  >
                    <TvToolIcon type={t.id} size={22} />
                  </button>
                );
              })
            ) : (
              <button
                onClick={() => {
                  setFavBarOpen(false);
                  setToolboxOpen(true);
                }}
                className="px-2.5 py-2 rounded-xl text-[11px] font-medium text-[#9598a1] text-center leading-snug active:bg-[#2a2e39]"
              >
                無星號工具
                <br />
                點此收藏
              </button>
            )}

            <div className="w-6 h-px bg-[#363a45] my-0.5" />

            <button
              onClick={() => {
                if (selectedDrawingId) {
                  setDrawings((prev: DrawingItem[]) =>
                    prev.filter((d) => d.id !== selectedDrawingId)
                  );
                  setSelectedDrawingId(null);
                } else {
                  setDrawings([]);
                }
                setFavBarOpen(false);
              }}
              className="p-2.5 rounded-xl text-[#ef5350] active:bg-[#2a2e39]"
              title="清除繪圖"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {/* 底部雙膠囊控制列：左邊鉛筆叫出「常用繪圖」，右邊藍色塗層打開「繪圖工具箱」 */}
        <div
          className="absolute inset-x-3 z-30 flex items-center justify-between pointer-events-none"
          style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <div className="pointer-events-auto flex items-center bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-full shadow-2xl overflow-hidden">
            <button
              onClick={() => {
                setTab('watchlist');
                setFavBarOpen(false);
                setToolboxOpen(false);
                setTfSheetOpen(false);
                setIndPanelOpen(false);
              }}
              className="px-4 py-2.5 text-[13.5px] font-bold text-white border-r border-[#363a45] active:bg-[#2a2e39]"
            >
              {symbol.replace('USDT.P', '').replace('USDT', '')}
            </button>
            <button
              onClick={() => {
                setTfSheetOpen((v) => !v);
                setFavBarOpen(false);
                setToolboxOpen(false);
                setIndPanelOpen(false);
              }}
              className="px-3.5 py-2.5 text-[13.5px] font-semibold text-[#d1d4dc] flex items-center gap-1 active:bg-[#2a2e39]"
            >
              <span>{tf.label}</span>
              <ChevronDown size={15} className="text-[#9598a1]" />
            </button>
          </div>

          <div className="pointer-events-auto flex items-center bg-[#1e222d]/95 backdrop-blur-md border border-[#363a45] rounded-full shadow-2xl px-1.5 py-1 gap-1">
            <button
              onClick={() => {
                setFavBarOpen((v) => !v);
                setToolboxOpen(false);
                setTfSheetOpen(false);
              }}
              className={`p-2.5 rounded-full transition ${
                favBarOpen || activeTool !== 'cursor'
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#d1d4dc] active:bg-[#2a2e39]'
              }`}
              title="常用繪圖（星號收藏）"
            >
              <Pencil size={20} />
            </button>
            <button
              onClick={() => {
                setToolboxOpen(true);
                setFavBarOpen(false);
                setTfSheetOpen(false);
              }}
              className="p-2.5 rounded-full transition bg-[#2962ff] text-white shadow"
              title="繪圖工具箱"
            >
              <Layers size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* 繪圖工具箱彈窗（藍色塗層 ICON 觸發） */}
      {toolboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 flex items-end"
          onClick={() => setToolboxOpen(false)}
        >
          <div
            className="w-full max-h-[78vh] bg-[#1e222d] border-t border-[#363a45] rounded-t-2xl p-4 flex flex-col gap-3 shadow-2xl"
            style={{ paddingBottom: 'max(22px, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#434651] rounded-full mx-auto -mt-1" />

            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-white">繪圖</span>
              <button
                onClick={() => setToolboxOpen(false)}
                className="p-1.5 rounded-full text-[#9598a1] hover:text-white active:bg-[#2a2e39]"
              >
                <X size={20} />
              </button>
            </div>

            {/* 搜尋框 */}
            <div className="relative flex items-center">
              <Search size={16} className="absolute left-3.5 text-[#787b86]" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="搜尋繪圖工具..."
                className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-[#787b86] outline-none"
              />
              {toolSearch && (
                <button
                  onClick={() => setToolSearch('')}
                  className="absolute right-2.5 p-1 text-[#787b86] hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* 分類篩選 */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {(['全部', '線段與路徑', '區域與預測'] as const).map((cat) => {
                const active = toolCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setToolCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      active
                        ? 'bg-[#2a2e39] text-white border border-[#434651]'
                        : 'text-[#9598a1] hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* 工具卡片列表（右上角星號切換，亮星號才會出現在鉛筆「常用繪圖」外列） */}
            <div className="grid grid-cols-3 gap-2.5 overflow-y-auto pr-0.5 py-0.5">
              {filteredToolboxTools.map((tool) => {
                const isStarred = starredTools.includes(tool.id);
                const isSelected = activeTool === tool.id;
                return (
                  <div
                    key={tool.id}
                    onClick={() => {
                      setActiveTool(tool.id);
                      setToolboxOpen(false);
                    }}
                    className={`relative flex flex-col items-center justify-center gap-2 py-3.5 px-2 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#2962ff]/15 border-[#2962ff] text-white'
                        : 'bg-[#262a36] border-[#323644] text-[#d1d4dc] active:bg-[#2f3443]'
                    }`}
                  >
                    <button
                      onClick={(e) => toggleStarTool(e, tool.id)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-md active:scale-90 transition"
                      title={isStarred ? '取消星號收藏' : '加入常用繪圖星號'}
                    >
                      <Star
                        size={14}
                        className={
                          isStarred
                            ? 'text-[#facc15] fill-[#facc15]'
                            : 'text-[#6c707d] hover:text-[#d1d4dc]'
                        }
                      />
                    </button>

                    <TvToolIcon type={tool.id} size={24} />
                    <span className="text-xs font-medium text-center leading-tight">
                      {tool.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 觀察清單分頁 */}
      {tab === 'watchlist' && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#131722]">
          <div className="flex-1 min-h-0 flex flex-col pb-28 [&>*]:!w-full [&>*]:!max-w-none [&>*]:!flex-1 [&>*]:!border-l-0">
            <WatchlistPanel
              symbol={symbol}
              onSelectSymbol={(s) => {
                setSymbol(s);
                setTab('chart');
              }}
              allSymbols={allSymbols}
              tickersMap={tickersMap}
              flagsMap={flagsMap}
              onToggleRedFlag={handleToggleRedFlag}
              onSetFlagColor={handleSetFlagColor}
              refreshingPairs={refreshingPairs}
              onRefreshPairs={fetchAllSymbols}
            />
          </div>

          <div
            className="fixed bottom-0 inset-x-0 z-50 bg-[#131722]/95 backdrop-blur-md border-t border-[#2a2e39] px-3 pt-2 flex flex-col gap-2"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={() => setTab('chart')}
              className="w-full flex items-center justify-between bg-[#1e222d] border border-[#363a45] rounded-full px-4 py-2.5 shadow-lg"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-white">{symbol}</span>
                {lastPrice !== '' && (
                  <span
                    className={`text-xs font-mono ${
                      pct >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'
                    }`}
                  >
                    {lastPrice} ({pct >= 0 ? '+' : ''}
                    {pct.toFixed(2)}%)
                  </span>
                )}
              </div>
              <ChevronDown size={15} className="rotate-180 text-[#9598a1]" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTab('watchlist')}
                className="flex flex-col items-center justify-center py-1 text-white font-semibold text-xs"
              >
                <List size={18} className="mb-0.5 text-[#2962ff]" />
                觀察清單
              </button>
              <button
                onClick={() => setTab('chart')}
                className="flex flex-col items-center justify-center py-1 text-[#9598a1] text-xs"
              >
                <CandlestickChart size={18} className="mb-0.5" />
                圖表
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 時間級別底部彈窗 */}
      {tfSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end"
          onClick={() => setTfSheetOpen(false)}
        >
          <div
            className="w-full bg-[#1e222d] border-t border-[#363a45] rounded-t-2xl p-4 space-y-3"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">時間級別與數據快取</span>
              <button
                onClick={() => setTfSheetOpen(false)}
                className="p-1 text-[#9598a1]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {timeframes.map((item: TimeframeOption) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setTf(item);
                    setTfSheetOpen(false);
                  }}
                  className={`py-2.5 rounded-xl text-xs font-semibold transition ${
                    tf.label === item.label
                      ? 'bg-[#2962ff] text-white shadow'
                      : 'bg-[#131722] text-[#d1d4dc]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pt-1 border-t border-[#2a2e39] flex gap-2">
              <button
                onClick={() => {
                  loadMoreHistory();
                  setTfSheetOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#131722] border border-[#363a45] text-xs font-semibold text-[#d1d4dc]"
              >
                <Download size={14} className="text-[#2962ff]" /> 預載更多 ({bars.length} 根)
              </button>
              <button
                onClick={() => {
                  loadAllHistory();
                  setTfSheetOpen(false);
                }}
                disabled={loadingAllHistory}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#2962ff]/20 border border-[#2962ff]/50 text-xs font-semibold text-[#2962ff] disabled:opacity-50"
              >
                {loadingAllHistory ? '載入全部中...' : '載入完整歷史'}
              </button>
            </div>
          </div>
        </div>
      )}

      {targetInd && (
        <IndicatorSettingsModal
          script={targetInd}
          onUpdate={(updated) =>
            setIndicators((prev: IndicatorScript[]) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            )
          }
          onClose={() => setIndSettingsId(null)}
        />
      )}

      {settingsModalOpen && selectedDrawing && (
        <DrawingSettingsModal
          drawing={selectedDrawing}
          symbol={symbol}
          onUpdate={handleUpdateDrawing}
          onSaveTemplate={() => handleSaveTemplate?.()}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}
    </div>
  );
};
