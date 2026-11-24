import { MONTHS, formatNumber } from "./data";

type LineChartProps = {
  values: number[];
  width?: number;
  height?: number;
  /** Axis labels and value markers; off for sparklines. */
  showAxes?: boolean;
};

/** Bare SVG line chart, intentionally low fidelity. */
export function LineChart({
  values,
  width = 720,
  height = 240,
  showAxes = true,
}: LineChartProps) {
  const pad = showAxes
    ? { l: 56, r: 12, t: 12, b: 28 }
    : { l: 2, r: 2, t: 2, b: 2 };
  const min = Math.min(0, ...values);
  const max = Math.max(...values) || 1;
  const x = (i: number) =>
    pad.l + (i * (width - pad.l - pad.r)) / Math.max(values.length - 1, 1);
  const y = (v: number) =>
    pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      {showAxes &&
        [min, (min + max) / 2, max].map((tick) => (
          <g key={tick}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--mb-color-border-neutral)"
              strokeDasharray="3 3"
            />
            <text
              x={pad.l - 8}
              y={y(tick) + 4}
              fontSize={11}
              textAnchor="end"
              fill="var(--mb-color-text-secondary)"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}
      {showAxes &&
        values.map((_, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            fontSize={11}
            textAnchor="middle"
            fill="var(--mb-color-text-secondary)"
          >
            {MONTHS[i]}
          </text>
        ))}
      <path
        d={path}
        fill="none"
        stroke="var(--mb-color-brand)"
        strokeWidth={showAxes ? 2 : 1.5}
      />
      {showAxes &&
        values.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={3}
            fill="var(--mb-color-brand)"
          />
        ))}
    </svg>
  );
}
