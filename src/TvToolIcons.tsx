import React from 'react';
import type { DrawingToolType } from './ChartCanvas';

interface IconProps {
  type: DrawingToolType;
  size?: number;
  className?: string;
}

export const TvToolIcon: React.FC<IconProps> = ({ type, size = 20, className = '' }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 28 28',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };

  switch (type) {
    case 'cursor':
      return (
        <svg {...common}>
          <line x1="14" y1="4" x2="14" y2="11" />
          <line x1="14" y1="17" x2="14" y2="24" />
          <line x1="4" y1="14" x2="11" y2="14" />
          <line x1="17" y1="14" x2="24" y2="14" />
          <circle cx="14" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );

    // 趨勢線：斜線兩端帶空心圓點
    case 'trendline':
      return (
        <svg {...common}>
          <line x1="7.8" y1="20.2" x2="20.2" y2="7.8" />
          <circle cx="6.2" cy="21.8" r="2.2" />
          <circle cx="21.8" cy="6.2" r="2.2" />
        </svg>
      );

    // 水平線：左右水平線中間帶一個空心圓點
    case 'hline':
      return (
        <svg {...common}>
          <line x1="4" y1="14" x2="11.6" y2="14" />
          <circle cx="14" cy="14" r="2.3" />
          <line x1="16.4" y1="14" x2="24" y2="14" />
        </svg>
      );

    // 路徑：三段折線、三個空心節點加箭頭
    case 'path':
      return (
        <svg {...common}>
          <line x1="5" y1="21" x2="10.4" y2="13.8" />
          <line x1="13.2" y1="13.8" x2="16.2" y2="17.8" />
          <line x1="19" y1="17.8" x2="23.5" y2="11.5" />
          <polyline points="19.5,11 23.8,11 23.8,15.3" />
          <circle cx="11.8" cy="12" r="2.1" />
          <circle cx="17.6" cy="19.5" r="2.1" />
        </svg>
      );

    // 矩形框：四角帶空心圓點
    case 'rect':
      return (
        <svg {...common}>
          <line x1="8.2" y1="6.5" x2="19.8" y2="6.5" />
          <line x1="8.2" y1="21.5" x2="19.8" y2="21.5" />
          <line x1="6.2" y1="8.5" x2="6.2" y2="19.5" />
          <line x1="21.8" y1="8.5" x2="21.8" y2="19.5" />
          <circle cx="6.2" cy="6.5" r="2" />
          <circle cx="21.8" cy="6.5" r="2" />
          <circle cx="6.2" cy="21.5" r="2" />
          <circle cx="21.8" cy="21.5" r="2" />
        </svg>
      );

    // 文字標註 T
    case 'text':
      return (
        <svg {...common}>
          <path d="M7 8.5V6.5H21V8.5" />
          <line x1="14" y1="6.5" x2="14" y2="21.5" />
          <line x1="10.5" y1="21.5" x2="17.5" y2="21.5" />
        </svg>
      );

    // 斐波那契回撤：四條平行水平線，第 2 與第 4 條帶空心圓點
    case 'fibo':
      return (
        <svg {...common}>
          <line x1="5" y1="6.5" x2="23" y2="6.5" />
          <line x1="5" y1="11.5" x2="19.2" y2="11.5" />
          <circle cx="21.4" cy="11.5" r="2.1" />
          <line x1="5" y1="16.5" x2="23" y2="16.5" />
          <line x1="8.8" y1="21.5" x2="23" y2="21.5" />
          <circle cx="6.6" cy="21.5" r="2.1" />
        </svg>
      );

    // 固定範圍成交量分佈圖 (FRVP)：左側直軸帶橫向柱狀分佈 + 下方圓點 + 右側垂直範圍線帶上方圓點
    case 'frvp':
      return (
        <svg {...common}>
          <line x1="8.5" y1="5" x2="8.5" y2="19.5" />
          <circle cx="8.5" cy="21.8" r="2.1" />
          <rect x="8.5" y="7.5" width="5.5" height="2.6" />
          <rect x="8.5" y="10.1" width="8.5" height="2.8" />
          <rect x="8.5" y="12.9" width="4" height="2.6" />
          <line x1="20.5" y1="8.5" x2="20.5" y2="23" />
          <circle cx="20.5" cy="6.2" r="2.1" />
        </svg>
      );

    // 多頭倉位：圓圈向上箭頭
    case 'long':
      return (
        <svg {...common} className={`text-[#089981] ${className}`}>
          <circle cx="14" cy="14" r="9.5" />
          <polyline points="10.2,13.8 14,10 17.8,13.8" />
          <line x1="14" y1="10" x2="14" y2="18.2" />
        </svg>
      );

    // 空頭倉位：圓圈向下箭頭
    case 'short':
      return (
        <svg {...common} className={`text-[#f23645] ${className}`}>
          <circle cx="14" cy="14" r="9.5" />
          <polyline points="10.2,14.2 14,18 17.8,14.2" />
          <line x1="14" y1="9.8" x2="14" y2="18" />
        </svg>
      );

    default:
      return null;
  }
};
