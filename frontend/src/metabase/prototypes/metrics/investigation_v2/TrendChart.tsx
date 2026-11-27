import type { AnnotationKind, Comparison, Series } from "./data";
import { MONTH_LABELS, SERIES_COLORS, SLICE_COLOR } from "./data";

const WIDTH = 360;
const HEIGHT = 150;
const PAD = { l: 8, r: 8, t: 28, b: 22 };

/**
 * Small trend line over grouped bars for the breakout values. `compare` adds a
 * slice and everyone else as two more lines.
 */
export function TrendChart({
  values,
  bars = [],
  compare,
  annotation,
}: {
  values: number[];
  bars?: Series[];
  compare?: Comparison;
  annotation: { kind: AnnotationKind; label?: string };
}) {
  const plotted = compare
    ? [...values, ...compare.slice, ...compare.rest]
    : values;
  const min = Math.min(...plotted) * 0.97;
  const max = Math.max(...plotted) * 1.02;
  const n = values.length;
  const x = (i: number) => PAD.l + (i * (WIDTH - PAD.l - PAD.r)) / (n - 1);
  const y = (v: number) =>
    PAD.t + (1 - (v - min) / (max - min || 1)) * (HEIGHT - PAD.t - PAD.b);
  const pathOf = (line: number[]) =>
    line.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const path = pathOf(values);

  const breakX = (x(n - 2) + x(n - 1)) / 2;
  const seasonalIndex = 1;

  const step = (WIDTH - PAD.l - PAD.r) / (n - 1);
  const barW = (step * 0.75) / Math.max(bars.length, 1);
  const barMax = Math.max(...bars.flatMap((bar) => bar.values), 1);
  const barH = (v: number) => (v / barMax) * (HEIGHT - PAD.t - PAD.b) * 0.6;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ display: "block" }}
    >
      {bars.map((bar, b) =>
        bar.values.map((v, i) => (
          <rect
            key={`${bar.label}-${i}`}
            x={x(i) - (barW * bars.length) / 2 + b * barW}
            y={HEIGHT - PAD.b - barH(v)}
            width={Math.max(barW - 0.5, 0.5)}
            height={barH(v)}
            fill={SERIES_COLORS[b % SERIES_COLORS.length]}
            opacity={0.75}
          />
        )),
      )}
      {annotation.kind === "break" && (
        <g>
          <line
            x1={breakX}
            x2={breakX}
            y1={PAD.t - 6}
            y2={HEIGHT - PAD.b}
            stroke="var(--mb-color-feedback-negative)"
            strokeDasharray="3 3"
          />
          <text
            x={breakX - 4}
            y={PAD.t - 12}
            fontSize={11}
            textAnchor="end"
            fill="var(--mb-color-feedback-negative)"
          >
            Trend broke
          </text>
        </g>
      )}
      {annotation.kind === "seasonal" && (
        <g>
          <line
            x1={x(seasonalIndex)}
            x2={x(n - 1)}
            y1={y(values[seasonalIndex])}
            y2={y(values[n - 1])}
            stroke="var(--mb-color-text-secondary)"
            strokeDasharray="3 3"
          />
          <text
            x={x(seasonalIndex) + 4}
            y={PAD.t - 12}
            fontSize={11}
            fill="var(--mb-color-text-secondary)"
          >
            Same spike last November
          </text>
          <circle
            cx={x(seasonalIndex)}
            cy={y(values[seasonalIndex])}
            r={4}
            fill="none"
            stroke="var(--mb-color-text-secondary)"
          />
        </g>
      )}
      {compare && (
        <g fill="none" strokeWidth={1.5}>
          <path
            d={pathOf(compare.rest)}
            stroke="var(--mb-color-text-secondary)"
            strokeDasharray="3 3"
          />
          <path d={pathOf(compare.slice)} stroke={SLICE_COLOR} />
        </g>
      )}
      <path
        d={path}
        fill="none"
        stroke="var(--mb-color-core-brand)"
        strokeWidth={2}
      />
      <circle
        cx={x(n - 1)}
        cy={y(values[n - 1])}
        r={3.5}
        fill="var(--mb-color-core-brand)"
      />
      {MONTH_LABELS.map((label, i) =>
        i % 3 === 1 || i === n - 1 ? (
          <text
            key={i}
            x={x(i)}
            y={HEIGHT - 6}
            fontSize={11}
            textAnchor="middle"
            fill="var(--mb-color-text-secondary)"
          >
            {label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

const BIG_W = 760;
const BIG_H = 320;
const BIG_PAD = { l: 56, r: 16, t: 16, b: 28 };

/** The Explorer's chart: one line per breakout value, with a y axis. */
export function MultiLineChart({
  series,
  format,
}: {
  series: Series[];
  format: (value: number) => string;
}) {
  const all = series.flatMap((line) => line.values);
  const min = 0;
  const max = Math.max(...all) * 1.1;
  const n = series[0]?.values.length ?? 0;
  const x = (i: number) =>
    BIG_PAD.l + (i * (BIG_W - BIG_PAD.l - BIG_PAD.r)) / Math.max(n - 1, 1);
  const y = (v: number) =>
    BIG_PAD.t +
    (1 - (v - min) / (max - min || 1)) * (BIG_H - BIG_PAD.t - BIG_PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${BIG_W} ${BIG_H}`}
      style={{ display: "block" }}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={BIG_PAD.l}
            x2={BIG_W - BIG_PAD.r}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--mb-color-border-neutral)"
          />
          <text
            x={BIG_PAD.l - 8}
            y={y(tick) + 4}
            fontSize={11}
            textAnchor="end"
            fill="var(--mb-color-text-secondary)"
          >
            {format(tick)}
          </text>
        </g>
      ))}
      {series.map((line, s) => (
        <path
          key={line.label}
          d={line.values
            .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
            .join(" ")}
          fill="none"
          stroke={SERIES_COLORS[s % SERIES_COLORS.length]}
          strokeWidth={2}
        />
      ))}
      {MONTH_LABELS.map((label, i) => (
        <text
          key={i}
          x={x(i)}
          y={BIG_H - 8}
          fontSize={11}
          textAnchor="middle"
          fill="var(--mb-color-text-secondary)"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
