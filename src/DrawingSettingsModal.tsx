import React from 'react';
import { X, Lock, Unlock } from 'lucide-react';
import {
  DEFAULT_FIBO_LEVELS,
  DEFAULT_POS_CONFIG,
  DEFAULT_FRVP_CONFIG,
  calcPositionMetrics,
  type DrawingItem,
  type PositionConfig,
  type FrvpConfig,
} from './ChartCanvas';

interface Props {
  drawing: DrawingItem;
  symbol: string;
  onUpdate: (d: DrawingItem) => void;
  onSaveTemplate: () => void;
  onClose: () => void;
}

export const DrawingSettingsModal: React.FC<Props> = ({ drawing, symbol, onUpdate, onSaveTemplate, onClose }) => {
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 w-[420px] max-h-[82%] overflow-y-auto bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl p-4 text-xs">
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#2a2e39]">
        <span className="font-bold text-sm text-white">
          {drawing.type === 'frvp' ? 'FRVP 固定範圍成交量分佈圖' :
           drawing.type === 'text' ? '文字標註內容與樣式' :
           drawing.type === 'path' ? '路徑 (Path) 樣式設定' :
           drawing.type === 'fibo' ? '斐波那契回撤設定 (24 組自訂位)' :
           drawing.type === 'long' ? '多頭倉位與顆數計算器' :
           drawing.type === 'short' ? '空頭倉位與顆數計算器' : '繪圖樣式設定'}
        </span>
        <button onClick={onClose} className="text-[#787b86] hover:text-white cursor-pointer"><X size={16} /></button>
      </div>

      {/* 通用鎖定開關：適用於所有繪圖工具 */}
      <div className="mb-3 pb-2.5 border-b border-[#2a2e39] flex items-center justify-between">
        <span className="text-[#d1d4dc]">固定位置 (防止誤拖移動)</span>
        <button
          onClick={() => onUpdate({ ...drawing, locked: !drawing.locked })}
          className={`flex items-center gap-1.5 px-3 py-1 rounded cursor-pointer font-semibold ${
            drawing.locked ? 'bg-[#ff9800]/20 text-[#ff9800] border border-[#ff9800]/40' : 'bg-[#2a2e39] text-[#d1d4dc]'
          }`}
        >
          {drawing.locked ? <><Lock size={13} /> 已鎖定</> : <><Unlock size={13} /> 未鎖定</>}
        </button>
      </div>

      {drawing.type === 'text' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[#787b86] mb-1">標註文字內容</label>
            <input
              autoFocus
              value={drawing.text || ''}
              onChange={(e) => onUpdate({ ...drawing, text: e.target.value })}
              className="w-full bg-[#131722] text-white px-3 py-1.5 rounded border border-[#2a2e39] outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[#787b86] mb-1">字體大小</label>
              <select
                value={drawing.fontSize || 13}
                onChange={(e) => onUpdate({ ...drawing, fontSize: Number(e.target.value) })}
                className="w-full bg-[#131722] text-white px-2 py-1.5 rounded border border-[#2a2e39] outline-none"
              >
                {[11, 12, 13, 14, 16, 18, 22].map((sz) => (
                  <option key={sz} value={sz}>{sz}px</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#787b86] mb-1">文字顏色</label>
              <input
                type="color"
                value={drawing.color || '#ffffff'}
                onChange={(e) => onUpdate({ ...drawing, color: e.target.value })}
                className="w-full h-8 bg-transparent border-0 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[#787b86] mb-1">標籤背景</label>
              <select
                value={drawing.bgColor || 'rgba(30, 34, 45, 0.88)'}
                onChange={(e) => onUpdate({ ...drawing, bgColor: e.target.value })}
                className="w-full bg-[#131722] text-white px-2 py-1.5 rounded border border-[#2a2e39] outline-none"
              >
                <option value="rgba(30, 34, 45, 0.88)">深灰底框</option>
                <option value="rgba(41, 98, 255, 0.85)">藍色底框</option>
                <option value="rgba(242, 54, 69, 0.85)">紅色底框</option>
                <option value="transparent">無背景 (純文字)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {drawing.type === 'frvp' && (() => {
        const cfg = drawing.frvpConfig || DEFAULT_FRVP_CONFIG;
        const updateFrvp = (patch: Partial<FrvpConfig>) => onUpdate({ ...drawing, frvpConfig: { ...cfg, ...patch } });
        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">行版面</span>
              <span className="bg-[#131722] px-3 py-1.5 rounded border border-[#2a2e39] text-white w-44">行數</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">行數</span>
              <input
                type="number"
                min={10}
                max={500}
                value={cfg.rows}
                onChange={(e) => updateFrvp({ rows: parseInt(e.target.value, 10) || 200 })}
                className="bg-[#131722] text-white px-3 py-1.5 rounded border border-[#2a2e39] outline-none font-mono w-44"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">成交量</span>
              <select
                value={cfg.volumeMode}
                onChange={(e) => updateFrvp({ volumeMode: e.target.value as 'up_down' | 'total' })}
                className="bg-[#131722] text-white px-3 py-1.5 rounded border border-[#2a2e39] outline-none w-44"
              >
                <option value="up_down">上/下</option>
                <option value="total">總量</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">數值區成交量 (%)</span>
              <input
                type="number"
                min={10}
                max={99}
                value={cfg.vaPercent}
                onChange={(e) => updateFrvp({ vaPercent: parseFloat(e.target.value) || 70 })}
                className="bg-[#131722] text-white px-3 py-1.5 rounded border border-[#2a2e39] outline-none font-mono w-44"
              />
            </div>
            <label className="flex items-center gap-2 text-white cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={cfg.extendRight}
                onChange={(e) => updateFrvp({ extendRight: e.target.checked })}
              />
              <span>向右延伸</span>
            </label>
          </div>
        );
      })()}

      {drawing.type === 'path' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[#d1d4dc]">線形圖顏色與粗細</span>
            <div className="flex items-center gap-2">
              <input type="color" value={drawing.color} onChange={(e) => onUpdate({ ...drawing, color: e.target.value })} className="w-7 h-7 bg-transparent border-0 cursor-pointer" />
              <select value={drawing.lineWidth} onChange={(e) => onUpdate({ ...drawing, lineWidth: Number(e.target.value) })} className="bg-[#131722] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none">
                <option value={1}>1px</option>
                <option value={2}>2px</option>
                <option value={3}>3px</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-white cursor-pointer">
            <input type="checkbox" checked={drawing.arrowEnd !== false} onChange={(e) => onUpdate({ ...drawing, arrowEnd: e.target.checked })} />
            <span>終點顯示箭頭 (→)</span>
          </label>
          <label className="flex items-center gap-2 text-white cursor-pointer">
            <input type="checkbox" checked={!!drawing.dashed} onChange={(e) => onUpdate({ ...drawing, dashed: e.target.checked })} />
            <span>使用虛線樣式</span>
          </label>
        </div>
      )}

      {drawing.type === 'fibo' && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-white cursor-pointer">
            <input type="checkbox" checked={!!drawing.extendRight} onChange={(e) => onUpdate({ ...drawing, extendRight: e.target.checked })} />
            <span>水平線向右無限延伸</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(drawing.fiboLevels || DEFAULT_FIBO_LEVELS).map((lv, idx) => (
              <div key={idx} className="flex items-center gap-1.5 bg-[#131722] px-2 py-1 rounded border border-[#2a2e39]">
                <input
                  type="checkbox"
                  checked={lv.enabled}
                  onChange={(e) => {
                    const next = [...(drawing.fiboLevels || DEFAULT_FIBO_LEVELS)];
                    next[idx] = { ...lv, enabled: e.target.checked };
                    onUpdate({ ...drawing, fiboLevels: next });
                  }}
                />
                <input
                  type="number"
                  step="0.001"
                  value={lv.value}
                  onChange={(e) => {
                    const next = [...(drawing.fiboLevels || DEFAULT_FIBO_LEVELS)];
                    next[idx] = { ...lv, value: parseFloat(e.target.value) || 0 };
                    onUpdate({ ...drawing, fiboLevels: next });
                  }}
                  className="w-full bg-transparent text-white font-mono outline-none"
                />
                <input
                  type="color"
                  value={lv.color}
                  onChange={(e) => {
                    const next = [...(drawing.fiboLevels || DEFAULT_FIBO_LEVELS)];
                    next[idx] = { ...lv, color: e.target.value };
                    onUpdate({ ...drawing, fiboLevels: next });
                  }}
                  className="w-4 h-4 bg-transparent border-0 cursor-pointer shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {(drawing.type === 'long' || drawing.type === 'short') && (() => {
        const cfg = drawing.posConfig || DEFAULT_POS_CONFIG;
        const m = calcPositionMetrics(drawing);
        const updateCfg = (patch: Partial<PositionConfig>) => onUpdate({ ...drawing, posConfig: { ...cfg, ...patch } });

        return (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#787b86] mb-1">帳戶大小 (USDT)</label>
                <input type="number" value={cfg.accountSize} onChange={(e) => updateCfg({ accountSize: parseFloat(e.target.value) || 0 })} className="w-full bg-[#131722] text-white px-2.5 py-1.5 rounded border border-[#2a2e39] outline-none font-mono" />
              </div>
              <div>
                <label className="block text-[#787b86] mb-1">槓桿倍數 (x)</label>
                <input type="number" value={cfg.leverage} onChange={(e) => updateCfg({ leverage: parseFloat(e.target.value) || 1 })} className="w-full bg-[#131722] text-white px-2.5 py-1.5 rounded border border-[#2a2e39] outline-none font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#787b86] mb-1">單筆風險數值</label>
                <input type="number" step="0.1" value={cfg.riskValue} onChange={(e) => updateCfg({ riskValue: parseFloat(e.target.value) || 0 })} className="w-full bg-[#131722] text-white px-2.5 py-1.5 rounded border border-[#2a2e39] outline-none font-mono" />
              </div>
              <div>
                <label className="block text-[#787b86] mb-1">風險計算單位</label>
                <select value={cfg.riskMode} onChange={(e) => updateCfg({ riskMode: e.target.value as 'percent' | 'amount' })} className="w-full bg-[#131722] text-white px-2.5 py-1.5 rounded border border-[#2a2e39] outline-none">
                  <option value="percent">帳戶百分比 (%)</option>
                  <option value="amount">固定金額 (USDT)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#2a2e39]">
              <div>
                <label className="block text-[#787b86] mb-1">進場價</label>
                <input type="number" step="any" value={drawing.p1} onChange={(e) => onUpdate({ ...drawing, p1: parseFloat(e.target.value) || 0 })} className="w-full bg-[#131722] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none font-mono" />
              </div>
              <div>
                <label className="block text-[#089981] mb-1">止盈價 (TP)</label>
                <input type="number" step="any" value={drawing.p3 ?? drawing.p1} onChange={(e) => onUpdate({ ...drawing, p3: parseFloat(e.target.value) || 0 })} className="w-full bg-[#131722] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none font-mono" />
              </div>
              <div>
                <label className="block text-[#f23645] mb-1">止損價 (SL)</label>
                <input type="number" step="any" value={drawing.p2} onChange={(e) => onUpdate({ ...drawing, p2: parseFloat(e.target.value) || 0 })} className="w-full bg-[#131722] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none font-mono" />
              </div>
            </div>
            <div className="bg-[#131722] border border-[#2962ff]/50 rounded p-3 flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[#787b86]">建議下單顆數 (Qty)：</span>
                <span className="text-base font-bold font-mono text-[#2962ff]">{m.qty.toFixed(4)} {symbol.replace('USDT', '')}</span>
              </div>
              <div className="flex justify-between"><span className="text-[#787b86]">風報比 (R:R)：</span><span className="font-mono text-white font-semibold">1 : {m.rr.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-[#787b86]">止損最大虧損：</span><span className="font-mono text-[#ef5350]">-${m.riskUsd.toFixed(2)} USDT</span></div>
              <div className="flex justify-between"><span className="text-[#787b86]">止盈預期獲利：</span><span className="font-mono text-[#26a69a]">+${m.profitUsd.toFixed(2)} USDT</span></div>
              <div className="flex justify-between"><span className="text-[#787b86]">合約價值 / 所需保證金：</span><span className="font-mono text-white">${m.notionalUsd.toFixed(1)} / ${m.marginUsd.toFixed(2)}</span></div>
            </div>
          </div>
        );
      })()}

      {(drawing.type === 'rect' || drawing.type === 'trendline' || drawing.type === 'hline') && (
        <label className="flex items-center gap-2 text-white cursor-pointer">
          <input type="checkbox" checked={!!drawing.dashed} onChange={(e) => onUpdate({ ...drawing, dashed: e.target.checked })} />
          <span>使用虛線樣式</span>
        </label>
      )}

      <div className="flex justify-end gap-2 mt-4 pt-2.5 border-t border-[#2a2e39]">
        <button onClick={onSaveTemplate} className="px-3 py-1.5 bg-[#2a2e39] hover:bg-[#363a45] text-white rounded cursor-pointer">存為範本</button>
        <button onClick={onClose} className="px-4 py-1.5 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-semibold rounded cursor-pointer">確認</button>
      </div>
    </div>
  );
};
