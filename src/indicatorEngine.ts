export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LineSegment {
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
  width: number;
  dashed?: boolean;
}

export interface ChartLabel {
  time: number;
  price: number;
  text: string;
  color: string;
}

export interface PlotSeries {
  id: string;
  name: string;
  color: string;
  width: number;
  data: { time: number; value: number }[];
}

export interface IndicatorOutput {
  lines: LineSegment[];
  labels: ChartLabel[];
  plots: PlotSeries[];
}

export interface MultiLevelConfig {
  tfMode: '固定時框' | '自動倍數';
  showDash: boolean;
  levels: { en: boolean; tf: string; mult: number; len: number; col: string; wid: number; smc: boolean }[];
  boundaries: { show: boolean; src: number; col: string; wid: number; txt: string }[];
  smcCfg: { show: boolean; max: number; colUp: string; colDn: string; colCh: string };
}

export interface IndicatorScript {
  id: string;
  name: string;
  enabled: boolean;
  code: string;
  uiType?: 'multilevel';
  multiLevelConfig?: MultiLevelConfig;
}

export const DEFAULT_MULTILEVEL_CONFIG: MultiLevelConfig = {
  tfMode: '固定時框',
  showDash: true,
  levels: [
    { en: false, tf: '15',  mult: 1,   len: 5, col: '#9598a1', wid: 1, smc: false },
    { en: false, tf: '60',  mult: 4,   len: 5, col: '#ff9800', wid: 1, smc: false },
    { en: true,  tf: '240', mult: 16,  len: 5, col: '#4caf50', wid: 2, smc: true  },
    { en: true,  tf: 'D',   mult: 64,  len: 5, col: '#2962ff', wid: 2, smc: true  },
    { en: false, tf: 'W',   mult: 256, len: 5, col: '#ab47bc', wid: 3, smc: false },
  ],
  boundaries: [
    { show: false, src: 1, col: '#787b86', wid: 1, txt: '邊界15m' },
    { show: false, src: 2, col: '#ff9800', wid: 1, txt: '邊界1H'  },
    { show: true,  src: 3, col: '#089981', wid: 2, txt: '邊界4H'  },
    { show: true,  src: 4, col: '#9c27b0', wid: 2, txt: '邊界D'   },
    { show: false, src: 5, col: '#880e4f', wid: 3, txt: '邊界W'   },
  ],
  smcCfg: {
    show: true,
    max: 50,
    colUp: '#4caf50',
    colDn: '#f23645',
    colCh: '#e040fb',
  },
};

export interface LevelCalcResult {
  segments: { t1: number; p1: number; t2: number; p2: number }[];
  lastT: number;
  lastP: number;
  extT: number;
  extP: number | null;
  structTopT: number;
  structTopP: number | null;
  structBotT: number;
  structBotP: number | null;
  smcEvents: { startT: number; endT: number; price: number; isCH: boolean; isUp: boolean }[];
}

export function calcLevelData(bars: Bar[], len: number): LevelCalcResult {
  const res: LevelCalcResult = {
    segments: [],
    lastT: 0,
    lastP: 0,
    extT: 0,
    extP: null,
    structTopT: 0,
    structTopP: null,
    structBotT: 0,
    structBotP: null,
    smcEvents: [],
  };
  if (!bars || bars.length < len * 2 + 2) return res;

  let dir = 0;
  let lastT: number | null = null, lastP: number | null = null;
  let prevT: number | null = null, prevP: number | null = null;

  let swH: number | null = null, swHT = 0, hBroken = true;
  let swL: number | null = null, swLT = 0, lBroken = true;
  let trend = 0;

  let structTopP: number | null = null, structTopT = 0;
  let structBotP: number | null = null, structBotT = 0;
  let needTopUpdate = false;
  let needBotUpdate = false;

  let extP: number | null = null;
  let extT = 0;

  const segMap = new Map<number, { t1: number; p1: number; t2: number; p2: number }>();

  for (let i = len * 2; i < bars.length; i++) {
    const pIdx = i - len;
    const candH = bars[pIdx].high;
    const candL = bars[pIdx].low;
    const candT = bars[pIdx].time;

    let isPH = true;
    let isPL = true;
    for (let j = pIdx - len; j <= pIdx + len; j++) {
      if (j === pIdx) continue;
      if (bars[j].high >= candH) isPH = false;
      if (bars[j].low <= candL) isPL = false;
    }

    const recordSegment = () => {
      if (lastT !== null && lastP !== null && prevT !== null && prevP !== null && lastT > prevT) {
        segMap.set(prevT, { t1: prevT, p1: prevP, t2: lastT, p2: lastP });
      }
    };

    if (isPH) {
      if (dir === 1 && lastP !== null) {
        if (candH > lastP) {
          lastP = candH; lastT = candT;
          swH = candH; swHT = candT; hBroken = false;
          extP = bars[i].low; extT = bars[i].time;
          recordSegment();
        }
      } else {
        prevP = lastP; prevT = lastT;
        lastP = candH; lastT = candT;
        dir = 1;
        swH = candH; swHT = candT; hBroken = false;
        extP = bars[i].low; extT = bars[i].time;
        if (structTopP === null) { structTopP = candH; structTopT = candT; }
        recordSegment();
      }

      if (needTopUpdate && trend === -1 && structTopP !== null && candH < structTopP) {
        structTopP = candH;
        structTopT = candT;
        needTopUpdate = false;
      }
    }

    if (isPL) {
      if (dir === -1 && lastP !== null) {
        if (candL < lastP) {
          lastP = candL; lastT = candT;
          swL = candL; swLT = candT; lBroken = false;
          extP = bars[i].high; extT = bars[i].time;
          recordSegment();
        }
      } else {
        prevP = lastP; prevT = lastT;
        lastP = candL; lastT = candT;
        dir = -1;
        swL = candL; swLT = candT; lBroken = false;
        extP = bars[i].high; extT = bars[i].time;
        if (structBotP === null) { structBotP = candL; structBotT = candT; }
        recordSegment();
      }

      if (needBotUpdate && trend === 1 && structBotP !== null && candL > structBotP) {
        structBotP = candL;
        structBotT = candT;
        needBotUpdate = false;
      }
    }

    const cur = bars[i];
    if (dir === 1) {
      if (extP === null || cur.low < extP) { extP = cur.low; extT = cur.time; }
    } else if (dir === -1) {
      if (extP === null || cur.high > extP) { extP = cur.high; extT = cur.time; }
    }

    if (swH !== null && !hBroken && cur.close > swH) {
      hBroken = true;
      const isCH = trend === -1;
      trend = 1;
      res.smcEvents.push({ startT: swHT, endT: cur.time, price: swH, isCH, isUp: true });
      if (swL !== null) { structBotP = swL; structBotT = swLT; }
      structTopP = cur.high; structTopT = cur.time;
      needBotUpdate = true;
      needTopUpdate = false;
    }

    if (swL !== null && !lBroken && cur.close < swL) {
      lBroken = true;
      const isCH = trend === 1;
      trend = -1;
      res.smcEvents.push({ startT: swLT, endT: cur.time, price: swL, isCH, isUp: false });
      if (swH !== null) { structTopP = swH; structTopT = swHT; }
      structBotP = cur.low; structBotT = cur.time;
      needTopUpdate = true;
      needBotUpdate = false;
    }

    if (trend === -1 && structBotP !== null && cur.low < structBotP) { structBotP = cur.low; structBotT = cur.time; }
    if (trend === 1 && structTopP !== null && cur.high > structTopP) { structTopP = cur.high; structTopT = cur.time; }
  }

  res.segments = Array.from(segMap.values());
  res.lastT = lastT ?? 0;
  res.lastP = lastP ?? 0;
  res.extT = extT;
  res.extP = extP;
  res.structTopT = structTopT;
  res.structTopP = structTopP;
  res.structBotT = structBotT;
  res.structBotP = structBotP;
  return res;
}

function calcEMA(vals: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out: number[] = [];
  let prev = vals[0] ?? 0;
  for (let i = 0; i < vals.length; i++) {
    prev = i === 0 ? vals[0] : vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function calcSMA(vals: number[], len: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= len) sum -= vals[i - len];
    out.push(i >= len - 1 ? sum / len : sum / (i + 1));
  }
  return out;
}

function calcATR(bars: Bar[], len: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) tr.push(bars[i].high - bars[i].low);
    else {
      const pc = bars[i - 1].close;
      tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc)));
    }
  }
  return calcEMA(tr, len);
}

export function runIndicatorScript(
  script: IndicatorScript,
  bars: Bar[],
  barsHTF: Bar[],
  mtfBarsMap: Record<string, Bar[]> = {}
): IndicatorOutput {
  const output: IndicatorOutput = { lines: [], labels: [], plots: [] };
  if (!bars || bars.length === 0) return output;
  const closes = bars.map((b) => b.close);

  const getBarsByTf = (tfCode: string): Bar[] => {
    const mapKey: Record<string, string> = {
      '15': '15m', '15m': '15m',
      '60': '1h', '1h': '1h', '1H': '1h',
      '240': '4h', '4h': '4h', '4H': '4h',
      'D': '1d', '1d': '1d', '1D': '1d',
      'W': '1w', '1w': '1w', '1W': '1w',
    };
    const k = mapKey[tfCode];
    if (k && mtfBarsMap[k] && mtfBarsMap[k].length >= 15) return mtfBarsMap[k];
    return bars;
  };

  const runMultiLevelPath = (cfg: MultiLevelConfig) => {
    const levelResults: LevelCalcResult[] = cfg.levels.map((lv) => {
      const targetBars = cfg.tfMode === '自動倍數' ? bars : getBarsByTf(lv.tf);
      const targetLen = cfg.tfMode === '自動倍數' ? lv.len * lv.mult : lv.len;
      const data = calcLevelData(targetBars, targetLen);

      if (lv.en) {
        for (const seg of data.segments) {
          output.lines.push({
            t1: seg.t1, p1: seg.p1,
            t2: seg.t2, p2: seg.p2,
            color: lv.col, width: lv.wid,
          });
        }
        if (cfg.showDash && data.lastT > 0 && data.extP !== null && data.extT >= data.lastT) {
          output.lines.push({
            t1: data.lastT, p1: data.lastP,
            t2: data.extT, p2: data.extP,
            color: lv.col, width: lv.wid, dashed: true,
          });
        }
      }

      if (cfg.smcCfg.show && lv.smc) {
        const recentEvents = data.smcEvents.slice(-cfg.smcCfg.max);
        for (const ev of recentEvents) {
          const cSmc = ev.isCH ? cfg.smcCfg.colCh : (ev.isUp ? cfg.smcCfg.colUp : cfg.smcCfg.colDn);
          output.lines.push({ t1: ev.startT, p1: ev.price, t2: ev.endT, p2: ev.price, color: cSmc, width: 1 });
          output.labels.push({
            time: Math.floor((ev.startT + ev.endT) / 2),
            price: ev.price,
            text: ev.isCH ? 'CH' : 'B',
            color: cSmc,
          });
        }
      }

      return data;
    });

    const lastBar = bars[bars.length - 1];
    const step = bars.length > 1 ? bars[1].time - bars[0].time : 900;
    const endT = lastBar.time + step * 22;
    const midT = Math.floor((lastBar.time + endT) / 2);

    cfg.boundaries.forEach((bnd) => {
      if (!bnd.show) return;
      const srcData = levelResults[bnd.src - 1];
      if (!srcData || srcData.structTopP === null || srcData.structBotP === null) return;
      output.lines.push({ t1: srcData.structTopT, p1: srcData.structTopP, t2: endT, p2: srcData.structTopP, color: bnd.col, width: bnd.wid });
      output.lines.push({ t1: srcData.structBotT, p1: srcData.structBotP, t2: endT, p2: srcData.structBotP, color: bnd.col, width: bnd.wid });
      output.labels.push({ time: midT, price: srcData.structTopP, text: bnd.txt, color: bnd.col });
      output.labels.push({ time: midT, price: srcData.structBotP, text: bnd.txt, color: bnd.col });
    });
  };

  // 若為圖形化設定版《級別路徑》，直接讀取最新 UI 勾選狀態執行
  if (script.uiType === 'multilevel') {
    runMultiLevelPath(script.multiLevelConfig || DEFAULT_MULTILEVEL_CONFIG);
    return output;
  }

  const sdk = {
    bars,
    barsHTF,
    mtfBarsMap,
    closes,
    runMultiLevelPath,
    ema: calcEMA,
    sma: calcSMA,
    atr: calcATR,
    plotSeries: (name: string, values: number[], color = '#2962ff', width = 2) => {
      const data = bars.map((b, idx) => ({ time: b.time, value: values[idx] ?? b.close }));
      output.plots.push({ id: `${name}_${output.plots.length}`, name, color, width, data });
    },
    drawLine: (t1: number, p1: number, t2: number, p2: number, opts?: { color?: string; width?: number; dashed?: boolean }) => {
      output.lines.push({ t1, p1, t2, p2, color: opts?.color || '#4caf50', width: opts?.width || 2, dashed: opts?.dashed });
    },
    drawLabel: (time: number, price: number, text: string, color = '#ffffff') => {
      output.labels.push({ time, price, text, color });
    },
    plotEMA: (period: number, color = '#2962ff', width = 2) => {
      const vals = calcEMA(closes, period);
      const data = bars.map((b, i) => ({ time: b.time, value: vals[i] }));
      output.plots.push({ id: `ema_${period}`, name: `EMA ${period}`, color, width, data });
    },
    plotSMA: (period: number, color = '#ff9800', width = 2) => {
      const vals = calcSMA(closes, period);
      const data = bars.map((b, i) => ({ time: b.time, value: vals[i] }));
      output.plots.push({ id: `sma_${period}`, name: `SMA ${period}`, color, width, data });
    },
    mergeOutput: (sub: IndicatorOutput) => {
      output.lines.push(...sub.lines);
      output.labels.push(...sub.labels);
      output.plots.push(...sub.plots);
    }
  };

  const fn = new Function('sdk', script.code);
  fn(sdk);
  return output;
}

export const DEFAULT_INDICATORS: IndicatorScript[] = [
  {
    id: 'ind_structure_v6',
    name: '級別路徑 (最終定案完整版)',
    enabled: true,
    uiType: 'multilevel',
    multiLevelConfig: DEFAULT_MULTILEVEL_CONFIG,
    code: '// 本指標已升級為圖形化參數面板，請點擊上方齒輪 (⚙️) 圖示直接勾選設定'
  },
  {
    id: 'ind_dual_ma_atr',
    name: '雙均線 + ATR 波動帶 (EMA 20 / EMA 60)',
    enabled: false,
    code: `const fast = sdk.ema(sdk.closes, 20);
const slow = sdk.ema(sdk.closes, 60);
const atr14 = sdk.atr(sdk.bars, 14);

sdk.plotSeries('EMA20', fast, '#ff9800', 2);
sdk.plotSeries('EMA60', slow, '#00bcd4', 2);
sdk.plotSeries('UpperATR', slow.map((v, i) => v + atr14[i] * 2), 'rgba(0, 188, 212, 0.35)', 1);
sdk.plotSeries('LowerATR', slow.map((v, i) => v - atr14[i] * 2), 'rgba(0, 188, 212, 0.35)', 1);`
  }
];
