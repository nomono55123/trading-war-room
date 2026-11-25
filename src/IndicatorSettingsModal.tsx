import React, { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  DEFAULT_MULTILEVEL_CONFIG,
  type IndicatorScript,
  type MultiLevelConfig,
} from './indicatorEngine';

interface Props {
  script: IndicatorScript;
  onUpdate: (updated: IndicatorScript) => void;
  onClose: () => void;
}

export const IndicatorSettingsModal: React.FC<Props> = ({ script, onUpdate, onClose }) => {
  const [tab, setTab] = useState<'levels' | 'boundaries' | 'smc'>('levels');
  const cfg: MultiLevelConfig = script.multiLevelConfig || DEFAULT_MULTILEVEL_CONFIG;

  const updateCfg = (patch: Partial<MultiLevelConfig>) => {
    onUpdate({
      ...script,
      uiType: 'multilevel',
      multiLevelConfig: { ...cfg, ...patch },
    });
  };

  const updateLevel = (idx: number, patch: Partial<MultiLevelConfig['levels'][0]>) => {
    const next = [...cfg.levels];
    next[idx] = { ...next[idx], ...patch };
    updateCfg({ levels: next });
  };

  const updateBoundary = (idx: number, patch: Partial<MultiLevelConfig['boundaries'][0]>) => {
    const next = [...cfg.boundaries];
    next[idx] = { ...next[idx], ...patch };
    updateCfg({ boundaries: next });
  };

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 w-[520px] max-w-[95vw] max-h-[84%] flex flex-col bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl text-xs">
      {/* 標題列 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39] shrink-0">
        <span className="font-bold text-sm text-white">{script.name}</span>
        <button onClick={onClose} className="text-[#787b86] hover:text-white cursor-pointer">
          <X size={16} />
        </button>
      </div>

      {/* TradingView 風格分頁標籤 */}
      <div className="flex items-center gap-4 px-4 pt-2 border-b border-[#2a2e39] text-xs shrink-0">
        {[
          { id: 'levels', label: '級別 1 ~ 5 設定' },
          { id: 'boundaries', label: '邊界 1 ~ 5 設定' },
          { id: 'smc', label: '結構突破 (B / CH)' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`pb-2 font-semibold cursor-pointer border-b-2 transition-colors ${
              tab === t.id ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 內容捲動區 */}
      <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
        {/* 1. 級別 1~5 與整體設定 */}
        {tab === 'levels' && (
          <>
            <div className="flex items-center justify-between bg-[#131722] px-3 py-2 rounded border border-[#2a2e39]">
              <div className="flex items-center gap-2">
                <span className="text-[#787b86]">時框模式：</span>
                <select
                  value={cfg.tfMode}
                  onChange={(e) => updateCfg({ tfMode: e.target.value as '固定時框' | '自動倍數' })}
                  className="bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none cursor-pointer"
                >
                  <option value="固定時框">固定時框</option>
                  <option value="自動倍數">自動倍數</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.showDash}
                  onChange={(e) => updateCfg({ showDash: e.target.checked })}
                />
                <span>顯示進行中段（極值虛線）</span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              {cfg.levels.map((lv, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                    lv.en ? 'bg-[#131722] border-[#363a45]' : 'bg-[#131722]/40 border-[#2a2e39]/60 opacity-70'
                  }`}
                >
                  <label className="flex items-center gap-2 font-semibold text-white cursor-pointer min-w-[78px]">
                    <input
                      type="checkbox"
                      checked={lv.en}
                      onChange={(e) => updateLevel(idx, { en: e.target.checked })}
                    />
                    <span>級別 {idx + 1}</span>
                  </label>

                  {cfg.tfMode === '固定時框' ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[#787b86]">時框</span>
                      <select
                        value={lv.tf}
                        onChange={(e) => updateLevel(idx, { tf: e.target.value })}
                        className="bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none cursor-pointer"
                      >
                        <option value="15">15分</option>
                        <option value="60">1小時</option>
                        <option value="240">4小時</option>
                        <option value="D">日線 (D)</option>
                        <option value="W">週線 (W)</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-[#787b86]">倍數</span>
                      <input
                        type="number"
                        min={1}
                        value={lv.mult}
                        onChange={(e) => updateLevel(idx, { mult: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-16 bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] font-mono outline-none"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <span className="text-[#787b86]">深度N</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={lv.len}
                      onChange={(e) => updateLevel(idx, { len: Math.max(1, parseInt(e.target.value, 10) || 5) })}
                      className="w-12 bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] font-mono outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={lv.col}
                      onChange={(e) => updateLevel(idx, { col: e.target.value })}
                      className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                      title="線段顏色"
                    />
                    <select
                      value={lv.wid}
                      onChange={(e) => updateLevel(idx, { wid: Number(e.target.value) })}
                      className="bg-[#1e222d] text-white px-1.5 py-1 rounded border border-[#2a2e39] outline-none cursor-pointer"
                      title="線寬"
                    >
                      <option value={1}>1px</option>
                      <option value={2}>2px</option>
                      <option value={3}>3px</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 2. 邊界 1~5 設定 */}
        {tab === 'boundaries' && (
          <div className="flex flex-col gap-2">
            {cfg.boundaries.map((bnd, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                  bnd.show ? 'bg-[#131722] border-[#363a45]' : 'bg-[#131722]/40 border-[#2a2e39]/60 opacity-70'
                }`}
              >
                <label className="flex items-center gap-2 font-semibold text-white cursor-pointer min-w-[74px]">
                  <input
                    type="checkbox"
                    checked={bnd.show}
                    onChange={(e) => updateBoundary(idx, { show: e.target.checked })}
                  />
                  <span>邊界 {idx + 1}</span>
                </label>

                <div className="flex items-center gap-1">
                  <span className="text-[#787b86]">取級別</span>
                  <select
                    value={bnd.src}
                    onChange={(e) => updateBoundary(idx, { src: Number(e.target.value) })}
                    className="bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none cursor-pointer"
                  >
                    <option value={1}>級別 1</option>
                    <option value={2}>級別 2</option>
                    <option value={3}>級別 3</option>
                    <option value={4}>級別 4</option>
                    <option value={5}>級別 5</option>
                  </select>
                </div>

                <input
                  value={bnd.txt}
                  onChange={(e) => updateBoundary(idx, { txt: e.target.value })}
                  placeholder="標籤文字"
                  className="w-24 bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] outline-none"
                />

                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={bnd.col}
                    onChange={(e) => updateBoundary(idx, { col: e.target.value })}
                    className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                  />
                  <select
                    value={bnd.wid}
                    onChange={(e) => updateBoundary(idx, { wid: Number(e.target.value) })}
                    className="bg-[#1e222d] text-white px-1.5 py-1 rounded border border-[#2a2e39] outline-none cursor-pointer"
                  >
                    <option value={1}>1px</option>
                    <option value={2}>2px</option>
                    <option value={3}>3px</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. 結構突破標記 (B=BOS / CH=CHOCH) */}
        {tab === 'smc' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between bg-[#131722] px-3 py-2.5 rounded border border-[#2a2e39]">
              <label className="flex items-center gap-2 font-semibold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.smcCfg.show}
                  onChange={(e) => updateCfg({ smcCfg: { ...cfg.smcCfg, show: e.target.checked } })}
                />
                <span>顯示結構突破標記（B=BOS / CH=CHOCH）</span>
              </label>

              <div className="flex items-center gap-1.5">
                <span className="text-[#787b86]">保留數量</span>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={cfg.smcCfg.max}
                  onChange={(e) => updateCfg({ smcCfg: { ...cfg.smcCfg, max: parseInt(e.target.value, 10) || 50 } })}
                  className="w-16 bg-[#1e222d] text-white px-2 py-1 rounded border border-[#2a2e39] font-mono outline-none"
                />
              </div>
            </div>

            <div className="bg-[#131722] px-3 py-2.5 rounded border border-[#2a2e39]">
              <div className="text-[#787b86] mb-2">勾選要顯示 B / CH 突破標記的級別：</div>
              <div className="flex items-center gap-4">
                {cfg.levels.map((lv, idx) => (
                  <label key={idx} className="flex items-center gap-1.5 text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lv.smc}
                      onChange={(e) => updateLevel(idx, { smc: e.target.checked })}
                    />
                    <span>級別 {idx + 1}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 bg-[#131722] px-3 py-2.5 rounded border border-[#2a2e39]">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">B↑ 多頭突破</span>
                <input
                  type="color"
                  value={cfg.smcCfg.colUp}
                  onChange={(e) => updateCfg({ smcCfg: { ...cfg.smcCfg, colUp: e.target.value } })}
                  className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">B↓ 空頭跌破</span>
                <input
                  type="color"
                  value={cfg.smcCfg.colDn}
                  onChange={(e) => updateCfg({ smcCfg: { ...cfg.smcCfg, colDn: e.target.value } })}
                  className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">CH 結構反轉</span>
                <input
                  type="color"
                  value={cfg.smcCfg.colCh}
                  onChange={(e) => updateCfg({ smcCfg: { ...cfg.smcCfg, colCh: e.target.value } })}
                  className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部按鈕列 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2e39] shrink-0">
        <button
          onClick={() => updateCfg(JSON.parse(JSON.stringify(DEFAULT_MULTILEVEL_CONFIG)))}
          className="flex items-center gap-1 text-[#787b86] hover:text-white cursor-pointer"
          title="還原預設參數"
        >
          <RotateCcw size={13} /> <span>重設為預設值</span>
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-semibold rounded cursor-pointer"
        >
          確認
        </button>
      </div>
    </div>
  );
};
