import type { AnnotationKind } from "./data";
import { MONTH_LABELS } from "./data";

const WIDTH = 360;
const HEIGHT = 150;
const PAD = { l: 8, r: 8, t: 28, b: 22 };

/** Small trend line with an optional "trend broke" or "seasonal" annotation. */
export function TrendChart({
  values,
  annotation,
}: {
  values: number[];
  annotation: { kind: AnnotationKind; label?: string };
}) {
  const min = Math.min(...values) * 0.97;
  const max = Math.max(...values) * 1.02;
  const n = values.length;
  const x = (i: number) => PAD.l + (i * (WIDTH - PAD.l - PAD.r)) / (n - 1);
  const y = (v: number) =>
    PAD.t + (1 - (v - min) / (max - min || 1)) * (HEIGHT - PAD.t - PAD.b);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");

  const breakX = (x(n - 2) + x(n - 1)) / 2;
  const seasonalIndex = 1;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ display: "block" }}
    >
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
