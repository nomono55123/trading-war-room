import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Search, ArrowUpDown, X, Flag, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import type { TickerInfo } from './useMarketData';

export type FlagColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export interface WatchlistGroup {
  id: string;
  name: string;
  symbols: string[];
}

export const FLAG_DEFS: { id: FlagColor; label: string; hex: string }[] = [
  { id: 'red', label: '紅色清單', hex: '#f23645' },
  { id: 'blue', label: '藍色清單', hex: '#2962ff' },
  { id: 'green', label: '綠色清單', hex: '#089981' },
  { id: 'yellow', label: '黃色清單', hex: '#ff9800' },
  { id: 'purple', label: '紫色清單', hex: '#9c27b0' },
];

const DEFAULT_WATCHLISTS: WatchlistGroup[] = [
  { id: 'wl_main', name: '主力觀察 (Main)', symbols: ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'SOLUSDT', 'ARMUSDT', 'ALABUSDT'] },
  { id: 'wl_all', name: '全市場 (All)', symbols: [] },
];

function formatPrice(p: number | undefined): string {
  if (p === undefined || Number.isNaN(p)) return '--';
  const abs = Math.abs(p);
  if (abs >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

export interface WatchlistListContext {
  activeWlId: string;
  sortByChange: 'none' | 'desc' | 'asc';
  symbols: string[];
}

interface Props {
  symbol: string;
  onSelectSymbol: (sym: string) => void;
  allSymbols: string[];
  tickersMap: Record<string, TickerInfo>;
  flagsMap: Record<string, FlagColor>;
  onToggleRedFlag: (e: React.MouseEvent, sym: string) => void;
  onSetFlagColor: (sym: string, color: FlagColor | null) => void;
  refreshingPairs: boolean;
  onRefreshPairs: () => void;
  onListContextChange?: (ctx: WatchlistListContext) => void;
}

export const WatchlistPanel: React.FC<Props> = React.memo(({
  symbol, onSelectSymbol, allSymbols, tickersMap, flagsMap,
  onToggleRedFlag, onSetFlagColor, refreshingPairs, onRefreshPairs,
  onListContextChange,
}) => {
  const [watchlists, setWatchlists] = useState<WatchlistGroup[]>(() => {
    try {
      const saved = localStorage.getItem('warroom_watchlists_v1');
      if (saved) {
        const list: WatchlistGroup[] = JSON.parse(saved).filter((w: WatchlistGroup) => w.id !== 'wl_gold');
        if (list.length > 0) return list;
      }
    } catch {}
    return DEFAULT_WATCHLISTS;
  });

  const [activeWlId, setActiveWlId] = useState<string>(() => {
    const saved = localStorage.getItem('warroom_active_wl_v1');
    return saved && saved !== 'wl_gold' ? saved : 'wl_main';
  });

  const [wlWidth, setWlWidth] = useState<number>(350);
  const [wlFilter, setWlFilter] = useState<string>('');
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [addSearch, setAddSearch] = useState<string>('');
  const [sortByChange, setSortByChange] = useState<'none' | 'desc' | 'asc'>(() => {
    const saved = localStorage.getItem('warroom_sort_change_v1');
    return saved === 'desc' || saved === 'asc' || saved === 'none' ? saved : 'none';
  });
  const [flagPickerSym, setFlagPickerSym] = useState<string | null>(null);
  const isResizingRef = useRef(false);

  useEffect(() => { localStorage.setItem('warroom_watchlists_v1', JSON.stringify(watchlists)); }, [watchlists]);
  useEffect(() => { localStorage.setItem('warroom_active_wl_v1', activeWlId); }, [activeWlId]);
  useEffect(() => { localStorage.setItem('warroom_sort_change_v1', sortByChange); }, [sortByChange]);

  useEffect(() => {
    const close = () => setFlagPickerSym(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const w = window.innerWidth - e.clientX;
      if (w >= 260 && w <= 650) {
        setWlWidth(w);
        window.dispatchEvent(new Event('resize'));
      }
    };
    const onUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = 'default';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const isFlagList = activeWlId.startsWith('flag_');
  const activeFlagColor = isFlagList ? (activeWlId.replace('flag_', '') as FlagColor) : null;
  const currentWatchlist = watchlists.find((w) => w.id === activeWlId) || watchlists[0];
  const isCustomEditable = !isFlagList && activeWlId !== 'wl_all';

  const displayedSymbols = useMemo(() => {
    let base: string[] = [];
    if (isFlagList && activeFlagColor) {
      base = Object.entries(flagsMap).filter(([, c]) => c === activeFlagColor).map(([s]) => s);
    } else if (activeWlId === 'wl_all') {
      base = allSymbols;
    } else {
      base = currentWatchlist?.symbols || [];
    }
    const q = wlFilter.trim().toUpperCase();
    let list = q ? base.filter((s) => s.includes(q)) : [...base];
    if (sortByChange !== 'none') {
      list.sort((a, b) => {
        const pa = tickersMap[a]?.priceChangePercent ?? -9999;
        const pb = tickersMap[b]?.priceChangePercent ?? -9999;
        return sortByChange === 'desc' ? pb - pa : pa - pb;
      });
    }
    return list;
  }, [isFlagList, activeFlagColor, flagsMap, activeWlId, allSymbols, currentWatchlist, wlFilter, sortByChange, tickersMap]);

  useEffect(() => {
    onListContextChange?.({ activeWlId, sortByChange, symbols: displayedSymbols });
  }, [activeWlId, sortByChange, displayedSymbols, onListContextChange]);

  const handleCreateList = () => {
    const name = prompt('請輸入新觀察清單名稱：');
    if (!name?.trim()) return;
    const id = `wl_${Date.now()}`;
    setWatchlists([...watchlists, { id, name: name.trim(), symbols: ['BTCUSDT', 'ETHUSDT', 'XAUUSDT'] }]);
    setActiveWlId(id);
  };

  const handleRenameList = () => {
    if (!isCustomEditable || !currentWatchlist) return;
    const nextName = prompt('修改觀察清單名稱：', currentWatchlist.name);
    if (!nextName?.trim()) return;
    setWatchlists(watchlists.map((w) => (w.id === activeWlId ? { ...w, name: nextName.trim() } : w)));
  };

  const handleDeleteList = () => {
    if (!isCustomEditable || watchlists.length <= 2) return;
    if (!confirm(`確定要刪除清單「${currentWatchlist.name}」嗎？`)) return;
    const remaining = watchlists.filter((w) => w.id !== activeWlId);
    setWatchlists(remaining);
    setActiveWlId(remaining[0].id);
  };

  const handleToggleSym = (sym: string) => {
    if (!isCustomEditable) return;
    setWatchlists(watchlists.map((w) => w.id !== activeWlId ? w : {
      ...w,
      symbols: w.symbols.includes(sym) ? w.symbols.filter((s) => s !== sym) : [...w.symbols, sym],
    }));
  };

  return (
    <div style={{ width: wlWidth }} className="relative flex flex-col bg-[#131722] border-l border-[#2a2e39] shrink-0">
      <div
        onMouseDown={() => { isResizingRef.current = true; document.body.style.cursor = 'col-resize'; }}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#2962ff] z-30"
        title="左右拖曳調整寬度"
      />

      {/* 頂部自訂清單快捷標籤列 */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-[#131722] border-b border-[#2a2e39] overflow-x-auto no-scrollbar">
        {watchlists.filter((w) => w.id !== 'wl_all').map((w) => {
          const active = activeWlId === w.id;
          return (
            <button
              key={w.id}
              onClick={() => setActiveWlId(w.id)}
              className={`px-2 py-1 rounded text-[11px] shrink-0 cursor-pointer transition-colors ${
                active ? 'bg-[#2962ff] text-white font-semibold' : 'bg-[#1e222d] text-[#787b86] hover:text-white'
              }`}
            >
              {w.name}
            </button>
          );
        })}
        <button
          onClick={() => setActiveWlId('wl_all')}
          className={`px-2 py-1 rounded text-[11px] shrink-0 cursor-pointer ${
            activeWlId === 'wl_all' ? 'bg-[#2962ff] text-white font-semibold' : 'bg-[#1e222d] text-[#787b86] hover:text-white'
          }`}
        >
          全市場 ({allSymbols.length})
        </button>
      </div>

      {/* 當前清單標題與操作列 */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#2a2e39] bg-[#1e222d] gap-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isFlagList && activeFlagColor && (
            <Flag size={13} style={{ color: FLAG_DEFS.find((f) => f.id === activeFlagColor)?.hex, fill: FLAG_DEFS.find((f) => f.id === activeFlagColor)?.hex }} className="shrink-0" />
          )}
          <span className="text-white font-semibold text-xs truncate">
            {isFlagList ? FLAG_DEFS.find((f) => f.id === activeFlagColor)?.label : currentWatchlist?.name}
          </span>
          {isCustomEditable && (
            <>
              <button onClick={handleRenameList} className="text-[#787b86] hover:text-white p-0.5 cursor-pointer" title="重新命名此清單">
                <Pencil size={11} />
              </button>
              {watchlists.length > 2 && (
                <button onClick={handleDeleteList} className="text-[#787b86] hover:text-[#ef5350] p-0.5 cursor-pointer" title="刪除此清單">
                  <Trash2 size={11} />
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activeWlId === 'wl_all' && (
            <button onClick={onRefreshPairs} className="p-1 hover:bg-[#2a2e39] rounded text-[#d1d4dc] cursor-pointer" title="重整全市場列表">
              <RefreshCw size={13} className={refreshingPairs ? 'animate-spin text-[#2962ff]' : ''} />
            </button>
          )}
          {isCustomEditable && (
            <button onClick={() => setAddModalOpen(!addModalOpen)} className="p-1 hover:bg-[#2a2e39] rounded text-[#d1d4dc] cursor-pointer" title="新增商品到此清單">
              <Plus size={15} />
            </button>
          )}
          <button onClick={handleCreateList} className="text-[11px] px-1.5 py-0.5 bg-[#2a2e39] hover:bg-[#363a45] rounded text-[#d1d4dc] cursor-pointer">+清單</button>
        </div>
      </div>

      {/* 多色旗幟快篩列 */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-[#2a2e39]/60 bg-[#1e222d]/50">
        <div className="flex items-center gap-1.5">
          {FLAG_DEFS.map((f) => {
            const active = activeWlId === `flag_${f.id}`;
            const count = Object.values(flagsMap).filter((c) => c === f.id).length;
            return (
              <button key={f.id} onClick={() => setActiveWlId(`flag_${f.id}`)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${active ? 'bg-[#2a2e39] text-white ring-1 ring-white/30' : 'hover:bg-[#2a2e39]/60 text-[#787b86]'}`}>
                <Flag size={11} style={{ color: f.hex, fill: f.hex }} /><span>{count}</span>
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-[#787b86]">{displayedSymbols.length} 檔</span>
      </div>

      {addModalOpen && isCustomEditable && (
        <div className="p-2 bg-[#1e222d] border-b border-[#2a2e39] flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px] text-[#787b86]">
            <span>加入至「{currentWatchlist.name}」</span>
            <button onClick={() => setAddModalOpen(false)} className="hover:text-white cursor-pointer"><X size={13} /></button>
          </div>
          <input autoFocus value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="搜尋代號 (如 BTC, XAU, SOL)..." className="w-full bg-[#131722] text-white text-xs px-2 py-1 rounded border border-[#2a2e39] outline-none" />
          <div className="max-h-36 overflow-y-auto flex flex-col gap-0.5">
            {allSymbols.filter((s) => s.includes(addSearch.trim().toUpperCase())).slice(0, 40).map((s) => {
              const added = currentWatchlist.symbols.includes(s);
              return (
                <button key={s} onClick={() => handleToggleSym(s)} className="flex justify-between px-2 py-1 text-xs rounded hover:bg-[#2a2e39] cursor-pointer">
                  <span>{s}.P</span>
                  <span className={added ? 'text-[#4caf50]' : 'text-[#787b86]'}>{added ? '✓ 已加入' : '+ 加入'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[#2a2e39]/60">
        <Search size={12} className="text-[#787b86]" />
        <input value={wlFilter} onChange={(e) => setWlFilter(e.target.value)} placeholder="篩選清單內商品..." className="w-full bg-transparent text-xs text-white outline-none" />
        {wlFilter && <button onClick={() => setWlFilter('')} className="text-[#787b86] hover:text-white cursor-pointer"><X size={12} /></button>}
      </div>

      <div className="grid grid-cols-12 gap-1 px-2.5 py-1.5 text-[11px] text-[#787b86] border-b border-[#2a2e39]">
        <div className="col-span-4 pl-4">商品</div>
        <div className="col-span-3 text-right">最新價</div>
        <div className="col-span-2 text-right">漲跌</div>
        <button onClick={() => setSortByChange((p) => (p === 'none' ? 'desc' : p === 'desc' ? 'asc' : 'none'))} className="col-span-3 flex items-center justify-end gap-0.5 hover:text-white cursor-pointer">
          <span>漲跌%</span><ArrowUpDown size={10} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#1e222d]">
        {displayedSymbols.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#787b86]">目前無標的，點上方「+」或切換至「全市場」標記旗幟即可加入！</div>
        )}
        {displayedSymbols.map((s) => {
          const tk = tickersMap[s];
          const isUp = (tk?.priceChangePercent ?? 0) >= 0;
          const colorClass = tk ? (isUp ? 'text-[#26a69a]' : 'text-[#ef5350]') : 'text-[#787b86]';
          const flagHex = FLAG_DEFS.find((f) => f.id === flagsMap[s])?.hex;

          return (
            <div key={s} onClick={() => onSelectSymbol(s)} className={`relative group grid grid-cols-12 gap-1 items-center px-2.5 py-2 text-xs cursor-pointer ${symbol === s ? 'bg-[#2a2e39]' : 'hover:bg-[#1e222d]'}`}>
              <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                <button
                  onClick={(e) => onToggleRedFlag(e, s)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setFlagPickerSym(flagPickerSym === s ? null : s); }}
                  className={`shrink-0 cursor-pointer ${flagHex ? 'opacity-100' : 'opacity-25 group-hover:opacity-80'}`}
                >
                  <Flag size={12} style={{ color: flagHex || '#787b86', fill: flagHex || 'transparent' }} />
                </button>
                <span className="font-semibold text-white truncate">{s.replace('USDT', '')}</span>
                <span className="text-[10px] text-[#787b86]">.P</span>
              </div>

              {flagPickerSym === s && (
                <div onClick={(e) => e.stopPropagation()} className="absolute left-6 top-7 z-50 flex items-center gap-1.5 bg-[#1e222d] border border-[#363a45] rounded px-2 py-1.5 shadow-xl">
                  {FLAG_DEFS.map((f) => (
                    <button key={f.id} onClick={() => { onSetFlagColor(s, f.id); setFlagPickerSym(null); }} className="hover:scale-125 cursor-pointer">
                      <Flag size={13} style={{ color: f.hex, fill: f.hex }} />
                    </button>
                  ))}
                  <button onClick={() => { onSetFlagColor(s, null); setFlagPickerSym(null); }} className="text-[10px] text-[#787b86] hover:text-white pl-1 border-l border-[#2a2e39] cursor-pointer">清除</button>
                </div>
              )}

              <div className={`col-span-3 text-right font-mono text-[11px] truncate ${colorClass}`}>{formatPrice(tk?.lastPrice)}</div>
              <div className={`col-span-2 text-right font-mono text-[11px] truncate ${colorClass}`}>{tk ? (tk.priceChange >= 0 ? '+' : '') + formatPrice(tk.priceChange) : '--'}</div>
              <div className="col-span-3 flex items-center justify-end gap-1">
                <span className={`font-mono text-[11px] font-semibold ${colorClass}`}>{tk ? `${isUp ? '+' : ''}${tk.priceChangePercent.toFixed(2)}%` : '--'}</span>
                {isCustomEditable && (
                  <button onClick={(e) => { e.stopPropagation(); handleToggleSym(s); }} className="opacity-0 group-hover:opacity-100 text-[#787b86] hover:text-[#ef5350] cursor-pointer"><X size={12} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
