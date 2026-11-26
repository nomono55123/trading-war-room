import { useState, useEffect, useRef, useCallback } from 'react';
import type { Bar } from './indicatorEngine';

export type TimeframeGroup = '分鐘' | '小時' | '日週月';

export interface TimeframeOption {
  label: string;
  apiInterval: string;
  htfInterval: string;
  sec: number;
  group: TimeframeGroup;
  pinned?: boolean;
  aggregateCount?: number;
}

export interface TickerInfo {
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

export const TIMEFRAMES: TimeframeOption[] = [
  { label: '1分',  apiInterval: '1m',  htfInterval: '5m',  sec: 60,      group: '分鐘', pinned: true },
  { label: '3分',  apiInterval: '3m',  htfInterval: '15m', sec: 180,     group: '分鐘', pinned: false },
  { label: '5分',  apiInterval: '5m',  htfInterval: '15m', sec: 300,     group: '分鐘', pinned: true },
  { label: '15M',  apiInterval: '15m', htfInterval: '1h',  sec: 900,     group: '分鐘', pinned: true },
  { label: '30分', apiInterval: '30m', htfInterval: '1h',  sec: 1800,    group: '分鐘', pinned: false },
  { label: 'H',    apiInterval: '1h',  htfInterval: '4h',  sec: 3600,    group: '小時', pinned: true },
  { label: '2H',   apiInterval: '1h',  htfInterval: '4h',  sec: 7200,    group: '小時', pinned: false, aggregateCount: 2 },
  { label: '3H',   apiInterval: '1h',  htfInterval: '1d',  sec: 10800,   group: '小時', pinned: true,  aggregateCount: 3 },
  { label: '4H',   apiInterval: '4h',  htfInterval: '1d',  sec: 14400,   group: '小時', pinned: true },
  { label: '6H',   apiInterval: '1h',  htfInterval: '1d',  sec: 21600,   group: '小時', pinned: false, aggregateCount: 6 },
  { label: '8H',   apiInterval: '1h',  htfInterval: '3d',  sec: 28800,   group: '小時', pinned: false, aggregateCount: 8 },
  { label: '12H',  apiInterval: '1h',  htfInterval: '3d',  sec: 43200,   group: '小時', pinned: false, aggregateCount: 12 },
  { label: 'D',    apiInterval: '1d',  htfInterval: '1w',  sec: 86400,   group: '日週月', pinned: true },
  { label: '3D',   apiInterval: '3d',  htfInterval: '1w',  sec: 259200,  group: '日週月', pinned: true },
  { label: '18D',  apiInterval: '1d',  htfInterval: '1w',  sec: 1555200, group: '日週月', pinned: true,  aggregateCount: 18 },
  { label: 'W',    apiInterval: '1w',  htfInterval: '1M',  sec: 604800,  group: '日週月', pinned: false },
  { label: 'M',    apiInterval: '1M',  htfInterval: '1M',  sec: 2592000, group: '日週月', pinned: false },
];

function makeBarsContinuous(bars: Bar[]): Bar[] {
  if (bars.length <= 1) return bars;
  const out: Bar[] = [{ ...bars[0] }];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = out[i - 1].close;
    const cur = bars[i];
    out.push({
      time: cur.time,
      open: prevClose,
      high: Math.max(cur.high, prevClose),
      low: Math.min(cur.low, prevClose),
      close: cur.close,
      volume: cur.volume,
    });
  }
  return out;
}

function aggregateBarsByPeriod(rawBars: Bar[], periodSec: number, count?: number): Bar[] {
  if (!count || count <= 1 || rawBars.length === 0) return rawBars;
  const buckets = new Map<number, Bar[]>();
  for (const b of rawBars) {
    const bucketTime = Math.floor(b.time / periodSec) * periodSec;
    const arr = buckets.get(bucketTime);
    if (arr) arr.push(b);
    else buckets.set(bucketTime, [b]);
  }
  const result: Bar[] = [];
  for (const [bucketTime, chunk] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    result.push({
      time: bucketTime,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((acc, b) => acc + (b.volume || 0), 0),
    });
  }
  return makeBarsContinuous(result);
}

export function useMarketData(symbol: string, tf: TimeframeOption, replayCutoffTime: number | null = null) {
  const [allSymbols, setAllSymbols] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'SOLUSDT']);
  const [bars, setBars] = useState<Bar[]>([]);
  const [barsHTF, setBarsHTF] = useState<Bar[]>([]);
  const [mtfBarsMap, setMtfBarsMap] = useState<Record<string, Bar[]>>({});
  const [loadingBars, setLoadingBars] = useState(false);
  const [loadingAllHistory, setLoadingAllHistory] = useState(false);
  const [tickersMap, setTickersMap] = useState<Record<string, TickerInfo>>({});
  const [refreshingPairs, setRefreshingPairs] = useState(false);

  const activeSymbolRef = useRef(symbol);
  const activeTfRef = useRef(tf);
  const replayCutoffRef = useRef(replayCutoffTime);
  const loadedContextRef = useRef<string>('');
  activeSymbolRef.current = symbol;
  activeTfRef.current = tf;
  replayCutoffRef.current = replayCutoffTime;

  const rawBarsRef = useRef<Bar[]>([]);
  const isFetchingMoreRef = useRef(false);
  const emptyStreakRef = useRef(0);
  const cancelAllHistoryRef = useRef(false);
  const pool3dCacheRef = useRef<Record<string, Bar[]>>({});
  const klineCacheRef = useRef<Record<string, Bar[]>>({});
  const mtfCacheBySymRef = useRef<Record<string, Record<string, Bar[]>>>({});

  const fetchAllSymbols = async () => {
    setRefreshingPairs(true);
    try {
      const res = await fetch('/bitunix-api/api/v1/futures/market/trading_pairs');
      const json = await res.json();
      const list = json?.data || [];
      if (Array.isArray(list) && list.length > 0) {
        const bitunixSyms = list.map((i: any) => i.symbol).filter((s: string) => typeof s === 'string' && s.length > 0).sort();
        setAllSymbols(bitunixSyms);
      }
    } catch {} finally {
      setRefreshingPairs(false);
    }
  };

  useEffect(() => {
    fetchAllSymbols();
  }, []);

  const fetchBatch = async (sym: string, interval: string, endMs?: number): Promise<Bar[]> => {
    const endParam = endMs ? `&endTime=${Math.floor(endMs)}` : '';
    const res = await fetch(`/bitunix-api/api/v1/futures/market/kline?symbol=${sym}&interval=${interval}&limit=500${endParam}`);
    const json = await res.json();
    const map = new Map<number, Bar>();
    for (const k of (json?.data || [])) {
      const t = Math.floor(Number(k.time) / 1000);
      if (!t || Number.isNaN(t)) continue;
      map.set(t, {
        time: t,
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.baseVol || k.quoteVol || k.volume || k.vol || '1') || 1,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  };

  const fetch3dPool = useCallback(async (sym: string): Promise<Bar[]> => {
    if (pool3dCacheRef.current[sym] && pool3dCacheRef.current[sym].length > 25) {
      return pool3dCacheRef.current[sym];
    }
    let combined: Bar[] = [];
    let endMs: number | undefined;
    for (let b = 0; b < 3; b++) {
      const chunk = await fetchBatch(sym, '3d', endMs);
      if (chunk.length === 0) break;
      combined = [...chunk, ...combined];
      endMs = chunk[0].time * 1000 - 1000;
    }
    const map = new Map<number, Bar>();
    for (const bar of combined) map.set(bar.time, bar);
    const sorted = makeBarsContinuous(Array.from(map.values()).sort((a, b) => a.time - b.time));
    pool3dCacheRef.current[sym] = sorted;
    return sorted;
  }, []);

  // 左滑渦輪預載：每次觸發連續抓取 4 批 (最多 2,000 根 K 線)
  const loadMoreHistory = useCallback(async (batches = 4) => {
    if (isFetchingMoreRef.current || emptyStreakRef.current >= 3 || rawBarsRef.current.length === 0) return false;
    isFetchingMoreRef.current = true;
    const targetSym = activeSymbolRef.current;
    const targetTf = activeTfRef.current;
    let addedAny = false;

    try {
      let workingRaw = rawBarsRef.current;
      for (let step = 0; step < batches; step++) {
        if (activeSymbolRef.current !== targetSym || activeTfRef.current.label !== targetTf.label) break;
        const earliestBefore = workingRaw[0].time;
        const chunk = await fetchBatch(targetSym, targetTf.apiInterval, earliestBefore * 1000 - 1);
        const olderOnly = chunk.filter((bar) => bar.time < earliestBefore);
        if (olderOnly.length === 0) {
          emptyStreakRef.current += 1;
          break;
        }
        emptyStreakRef.current = 0;
        addedAny = true;
        const map = new Map<number, Bar>();
        for (const b of olderOnly) map.set(b.time, b);
        for (const b of workingRaw) map.set(b.time, b);
        workingRaw = makeBarsContinuous(Array.from(map.values()).sort((a, b) => a.time - b.time));
      }

      if (addedAny && activeSymbolRef.current === targetSym && activeTfRef.current.label === targetTf.label) {
        rawBarsRef.current = workingRaw;
        const finalBars = aggregateBarsByPeriod(workingRaw, targetTf.sec, targetTf.aggregateCount);
        setBars(finalBars);
      }
    } catch {} finally {
      isFetchingMoreRef.current = false;
    }
    return addedAny;
  }, []);

  // 一鍵背景載入全部歷史 K 線直到上市首日
  const loadAllHistory = useCallback(async () => {
    if (loadingAllHistory) {
      cancelAllHistoryRef.current = true;
      setLoadingAllHistory(false);
      return;
    }
    cancelAllHistoryRef.current = false;
    setLoadingAllHistory(true);
    const targetSym = activeSymbolRef.current;
    const targetTf = activeTfRef.current;

    try {
      while (!cancelAllHistoryRef.current && emptyStreakRef.current < 3) {
        if (activeSymbolRef.current !== targetSym || activeTfRef.current.label !== targetTf.label) break;
        const ok = await loadMoreHistory(4);
        if (!ok) break;
        await new Promise((r) => setTimeout(r, 120));
      }
    } finally {
      setLoadingAllHistory(false);
    }
  }, [loadingAllHistory, loadMoreHistory]);

  // 跳轉到指定時間戳 (秒)，直接抓取該日期前後共 1,500 根 K 線
  const jumpToTimestamp = useCallback(async (targetSec: number) => {
    const targetSym = activeSymbolRef.current;
    const targetTf = activeTfRef.current;
    cancelAllHistoryRef.current = true;
    setLoadingAllHistory(false);
    setLoadingBars(true);
    emptyStreakRef.current = 0;

    try {
      const nowMs = Date.now();
      let endMs: number | undefined = Math.min(nowMs, (targetSec + targetTf.sec * 400) * 1000);
      let combined: Bar[] = [];
      for (let b = 0; b < 3; b++) {
        const chunk = await fetchBatch(targetSym, targetTf.apiInterval, endMs);
        if (chunk.length === 0) break;
        combined = [...chunk, ...combined];
        endMs = chunk[0].time * 1000 - 1000;
      }
      if (activeSymbolRef.current === targetSym && activeTfRef.current.label === targetTf.label && combined.length > 0) {
        const map = new Map<number, Bar>();
        for (const bar of combined) map.set(bar.time, bar);
        const continuous = makeBarsContinuous(Array.from(map.values()).sort((a, b) => a.time - b.time));
        rawBarsRef.current = continuous;
        setBars(aggregateBarsByPeriod(continuous, targetTf.sec, targetTf.aggregateCount));
      }
    } catch {} finally {
      setLoadingBars(false);
    }
  }, []);

  const applyLiveTick = (tickSymbol: string, price: number) => {
    if (replayCutoffRef.current !== null) return;
    if (tickSymbol !== activeSymbolRef.current || !price || Number.isNaN(price)) return;
    const curTf = activeTfRef.current;

    const updateLast = (prev: Bar[], periodSec: number): Bar[] => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.close > 0 && (price > last.close * 5 || price < last.close * 0.2)) return prev;

      const nowSec = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(nowSec / periodSec) * periodSec;

      if (bucket > last.time) {
        const openPrice = last.close;
        return [...prev, { time: bucket, open: openPrice, high: Math.max(openPrice, price), low: Math.min(openPrice, price), close: price, volume: 0 }];
      }

      if (last.close === price && price <= last.high && price >= last.low) return prev;
      const copy = prev.slice();
      copy[copy.length - 1] = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
      return copy;
    };

    setBars((prev) => updateLast(prev, curTf.sec));
    setBarsHTF((prev) => updateLast(prev, curTf.sec * 4));
  };

  useEffect(() => {
    let closed = false;
    const fetchBitunixTickers = async () => {
      if (closed) return;
      try {
        const res = await fetch('/bitunix-api/api/v1/futures/market/tickers');
        const json = await res.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        if (list.length > 0 && !closed) {
          const nextMap: Record<string, TickerInfo> = {};
          for (const item of list) {
            const sym = item.symbol;
            const last = parseFloat(item.lastPrice || item.last || item.markPrice);
            const open24 = parseFloat(item.open || item.openPrice);
            let chg = parseFloat(item.priceChange || item.change);
            let pct = parseFloat(item.priceChangePercent || item.changePercent || item.riseFallRate);
            if (Number.isNaN(chg) && !Number.isNaN(last) && !Number.isNaN(open24)) chg = last - open24;
            if (Number.isNaN(pct) && !Number.isNaN(chg) && !Number.isNaN(open24) && open24 !== 0) pct = (chg / open24) * 100;
            else if (!Number.isNaN(pct) && Math.abs(pct) < 1 && item.riseFallRate !== undefined) pct *= 100;
            if (sym && !Number.isNaN(last)) {
              nextMap[sym] = { lastPrice: last, priceChange: Number.isNaN(chg) ? 0 : chg, priceChangePercent: Number.isNaN(pct) ? 0 : pct };
            }
          }
          setTickersMap(nextMap);
          const cur = activeSymbolRef.current;
          if (nextMap[cur]) applyLiveTick(cur, nextMap[cur].lastPrice);
        }
      } catch {}
    };
    fetchBitunixTickers();
    const timer = setInterval(fetchBitunixTickers, 2500);
    return () => { closed = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    const targetSym = symbol;
    try {
      ws = new WebSocket('wss://fapi.bitunix.com/public/');
      ws.onopen = () => ws?.send(JSON.stringify({ op: 'subscribe', args: [{ symbol: targetSym, ch: 'trade' }] }));
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const msgSym = msg?.symbol || msg?.arg?.symbol;
          if (msgSym && msgSym !== targetSym) return;
          const d = msg?.data;
          if (Array.isArray(d) && d[0]?.p) applyLiveTick(targetSym, parseFloat(d[0].p));
        } catch {}
      };
    } catch {}
    return () => { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [symbol, tf]);

  useEffect(() => {
    const contextKey = `${symbol}_${tf.label}`;
    const anchor = replayCutoffTime;
    const cur = rawBarsRef.current;

    if (
      loadedContextRef.current === contextKey &&
      anchor !== null &&
      cur.length > 30 &&
      anchor >= cur[15].time &&
      anchor <= cur[cur.length - 1].time
    ) {
      return;
    }

    let cancelled = false;
    cancelAllHistoryRef.current = true;
    setLoadingAllHistory(false);
    const prevSymbol = loadedContextRef.current.split('_')[0];
    loadedContextRef.current = contextKey;
    isFetchingMoreRef.current = false;
    emptyStreakRef.current = 0;

    const cacheKey = `${symbol}_${tf.apiInterval}`;
    const cachedRaw = anchor === null ? klineCacheRef.current[cacheKey] : undefined;
    const cachedMtf = anchor === null ? mtfCacheBySymRef.current[symbol] : undefined;

    // 1. 記憶體快取命中：0ms 秒開主圖與指標
    if (cachedRaw && cachedRaw.length > 0) {
      rawBarsRef.current = cachedRaw;
      setBars(aggregateBarsByPeriod(cachedRaw, tf.sec, tf.aggregateCount));
      setLoadingBars(false);
    } else {
      setBars([]);
      setBarsHTF([]);
      rawBarsRef.current = [];
      setLoadingBars(true);
    }

    if (cachedMtf && Object.keys(cachedMtf).length > 0) {
      setMtfBarsMap(cachedMtf);
    } else if (prevSymbol !== symbol) {
      setMtfBarsMap({});
    }

    const mergeBars = (a: Bar[], b: Bar[]): Bar[] => {
      const map = new Map<number, Bar>();
      for (const bar of a) map.set(bar.time, bar);
      for (const bar of b) map.set(bar.time, bar);
      return makeBarsContinuous(Array.from(map.values()).sort((x, y) => x.time - y.time));
    };

    const fetchDeep = async (sym: string, interval: string, batches: number, initialEndMs?: number): Promise<Bar[]> => {
      let combined: Bar[] = [];
      let endMs: number | undefined = initialEndMs;
      for (let b = 0; b < batches; b++) {
        const chunk = await fetchBatch(sym, interval, endMs);
        if (chunk.length === 0) break;
        combined = [...chunk, ...combined];
        endMs = chunk[0].time * 1000 - 1000;
      }
      return mergeBars(combined, []);
    };

    (async () => {
      try {
        const nowMs = Date.now();
        const anchorEndMs = anchor !== null
          ? Math.min(nowMs, (anchor + tf.sec * 80) * 1000)
          : undefined;
        const targetCurBatches = tf.aggregateCount
          ? Math.min(16, Math.max(6, Math.ceil(tf.aggregateCount * 1.5)))
          : 6;

        // 2. 首屏極速出圖：主圖與各跨週期先各抓最新 1 批（500 根），第一時間渲染
        const [fastCur, fastHtf, m15_1, h1_1, h4_1, d1_1, w1_1] = await Promise.all([
          fetchBatch(symbol, tf.apiInterval, anchorEndMs),
          fetchBatch(symbol, tf.htfInterval, anchorEndMs),
          fetchBatch(symbol, '15m', anchorEndMs),
          fetchBatch(symbol, '1h', anchorEndMs),
          fetchBatch(symbol, '4h', anchorEndMs),
          fetchBatch(symbol, '1d', anchorEndMs),
          fetchBatch(symbol, '1w', anchorEndMs),
        ]);

        if (cancelled || activeSymbolRef.current !== symbol || activeTfRef.current.label !== tf.label) return;

        const mergedFastCur = mergeBars(klineCacheRef.current[cacheKey] || [], fastCur);
        if (anchor === null && mergedFastCur.length > 0) klineCacheRef.current[cacheKey] = mergedFastCur;
        rawBarsRef.current = mergedFastCur;
        if (mergedFastCur.length > 0) setBars(aggregateBarsByPeriod(mergedFastCur, tf.sec, tf.aggregateCount));
        if (fastHtf.length > 0) setBarsHTF(makeBarsContinuous(fastHtf));

        const prevMtf = mtfCacheBySymRef.current[symbol] || {};
        const fastMtfMap: Record<string, Bar[]> = {
          '15m': mergeBars(prevMtf['15m'] || [], m15_1),
          '1h':  mergeBars(prevMtf['1h']  || [], h1_1),
          '4h':  mergeBars(prevMtf['4h']  || [], h4_1),
          '1d':  mergeBars(prevMtf['1d']  || [], d1_1),
          '1w':  mergeBars(prevMtf['1w']  || [], w1_1),
        };
        if (anchor === null) mtfCacheBySymRef.current[symbol] = fastMtfMap;
        setMtfBarsMap(fastMtfMap);
        setLoadingBars(false);

        // 3. 背景靜默補齊剩餘歷史批次（不阻塞畫面操作）
        const curOldestMs = mergedFastCur.length > 0 ? mergedFastCur[0].time * 1000 - 1000 : anchorEndMs;
        const m15OldestMs = fastMtfMap['15m'].length > 0 ? fastMtfMap['15m'][0].time * 1000 - 1000 : anchorEndMs;
        const h1OldestMs  = fastMtfMap['1h'].length > 0  ? fastMtfMap['1h'][0].time * 1000 - 1000  : anchorEndMs;
        const h4OldestMs  = fastMtfMap['4h'].length > 0  ? fastMtfMap['4h'][0].time * 1000 - 1000  : anchorEndMs;
        const d1OldestMs  = fastMtfMap['1d'].length > 0  ? fastMtfMap['1d'][0].time * 1000 - 1000  : anchorEndMs;

        const [deepCur, deepM15, deepH1, deepH4, deepD1] = await Promise.all([
          targetCurBatches > 1 && mergedFastCur.length < targetCurBatches * 450
            ? fetchDeep(symbol, tf.apiInterval, targetCurBatches - 1, curOldestMs)
            : Promise.resolve([]),
          fastMtfMap['15m'].length < 1200 ? fetchDeep(symbol, '15m', 2, m15OldestMs) : Promise.resolve([]),
          fastMtfMap['1h'].length < 1200  ? fetchDeep(symbol, '1h', 2, h1OldestMs)   : Promise.resolve([]),
          fastMtfMap['4h'].length < 1200  ? fetchDeep(symbol, '4h', 2, h4OldestMs)   : Promise.resolve([]),
          fastMtfMap['1d'].length < 800   ? fetchDeep(symbol, '1d', 1, d1OldestMs)   : Promise.resolve([]),
        ]);

        if (cancelled || activeSymbolRef.current !== symbol || activeTfRef.current.label !== tf.label) return;

        if (deepCur.length > 0) {
          const fullCur = mergeBars(deepCur, rawBarsRef.current);
          if (anchor === null) klineCacheRef.current[cacheKey] = fullCur;
          rawBarsRef.current = fullCur;
          setBars(aggregateBarsByPeriod(fullCur, tf.sec, tf.aggregateCount));
        }

        const fullMtfMap: Record<string, Bar[]> = {
          '15m': mergeBars(deepM15, fastMtfMap['15m']),
          '1h':  mergeBars(deepH1,  fastMtfMap['1h']),
          '4h':  mergeBars(deepH4,  fastMtfMap['4h']),
          '1d':  mergeBars(deepD1,  fastMtfMap['1d']),
          '1w':  fastMtfMap['1w'],
        };
        if (anchor === null) {
          mtfCacheBySymRef.current[symbol] = fullMtfMap;
          for (const [iv, list] of Object.entries(fullMtfMap)) {
            const k = `${symbol}_${iv}`;
            klineCacheRef.current[k] = mergeBars(klineCacheRef.current[k] || [], list);
          }
        }
        setMtfBarsMap(fullMtfMap);
      } catch {} finally {
        if (!cancelled) setLoadingBars(false);
      }
    })();

    return () => { cancelled = true; };
  }, [symbol, tf, replayCutoffTime]);

  return {
    allSymbols, bars, barsHTF, mtfBarsMap, loadingBars, loadingAllHistory,
    tickersMap, refreshingPairs, fetchAllSymbols, loadMoreHistory, loadAllHistory, jumpToTimestamp, fetch3dPool
  };
}
