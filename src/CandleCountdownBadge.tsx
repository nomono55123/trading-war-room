import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Bar } from './indicatorEngine';
import type { TimeframeOption } from './useMarketData';

function formatCountdown(remainSec: number): string {
  const s = Math.max(0, Math.floor(remainSec));
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) return `${days}d ${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

export function useCandleCountdown(lastBar: Bar | undefined, tf: TimeframeOption) {
  const [remainSec, setRemainSec] = useState<number>(0);

  useEffect(() => {
    const calc = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const period = tf.sec || 60;
      const barStart = lastBar ? lastBar.time : Math.floor(nowSec / period) * period;
      let nextClose = barStart + period;
      if (nextClose <= nowSec) {
        const currentBucket = Math.floor(nowSec / period) * period;
        nextClose = currentBucket + period;
      }
      setRemainSec(Math.max(0, nextClose - nowSec));
    };
    calc();
    const timer = setInterval(calc, 250);
    return () => clearInterval(timer);
  }, [lastBar?.time, tf.sec]);

  return {
    remainSec,
    text: formatCountdown(remainSec),
    isUrgent: remainSec > 0 && remainSec <= 10,
  };
}

export const TopbarCountdownBadge: React.FC<{
  lastBar: Bar | undefined;
  tf: TimeframeOption;
  hidden?: boolean;
}> = ({ lastBar, tf, hidden }) => {
  const { text, isUrgent } = useCandleCountdown(lastBar, tf);
  if (hidden || !lastBar) return null;

  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] border transition-colors shrink-0 ${
        isUrgent
          ? 'bg-[#f23645]/20 border-[#f23645]/60 text-[#ff6b6b] font-bold'
          : 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]'
      }`}
      title={`距離當前 ${tf.label} K 棒收盤剩餘時間`}
    >
      <Clock size={11} className={isUrgent ? 'text-[#ff6b6b]' : 'text-[#787b86]'} />
      <span>{text}</span>
    </div>
  );
};

export const PriceAxisCountdownTag: React.FC<{
  chartRef: React.RefObject<IChartApi | null>;
  candleSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  lastBar: Bar | undefined;
  tf: TimeframeOption;
  hidden?: boolean;
}> = ({ chartRef, candleSeriesRef, lastBar, tf, hidden }) => {
  const { text, isUrgent } = useCandleCountdown(lastBar, tf);
  const [topY, setTopY] = useState<number | null>(null);

  useEffect(() => {
    const updatePos = () => {
      const series = candleSeriesRef.current;
      const chart = chartRef.current;
      if (!series || !chart || !lastBar) {
        setTopY(null);
        return;
      }
      const y = series.priceToCoordinate(lastBar.close);
      if (y === null || Number.isNaN(y) || y < 10 || y > chart.paneSize().height - 24) {
        setTopY(null);
      } else {
        setTopY(y);
      }
    };

    updatePos();
    const timer = setInterval(updatePos, 200);
    return () => clearInterval(timer);
  }, [lastBar?.close, lastBar?.time, chartRef, candleSeriesRef]);

  if (hidden || !lastBar || topY === null) return null;
  const isBull = lastBar.close >= lastBar.open;

  return (
    <div
      style={{ top: Math.round(topY + 11) }}
      className={`pointer-events-none absolute right-0 z-30 px-1.5 py-[1px] font-mono text-[11px] leading-tight text-white shadow-sm rounded-l-sm ${
        isUrgent
          ? 'bg-[#ff9800] font-bold'
          : isBull
            ? 'bg-[#089981]'
            : 'bg-[#f23645]'
      }`}
    >
      {text}
    </div>
  );
};
