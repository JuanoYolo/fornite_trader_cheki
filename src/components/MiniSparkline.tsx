interface Props {
  data: { t: number; price: number }[];
  positive: boolean;
  width?: number;
  height?: number;
}

export default function MiniSparkline({ data, positive, width = 120, height = 40 }: Props) {
  if (!data.length) return null;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.price - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  const stroke = positive ? 'hsl(145, 72%, 46%)' : 'hsl(0, 72%, 55%)';
  const fillId = `sparkline-${positive ? 'gain' : 'loss'}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${fillId})`}
      />
    </svg>
  );
}
