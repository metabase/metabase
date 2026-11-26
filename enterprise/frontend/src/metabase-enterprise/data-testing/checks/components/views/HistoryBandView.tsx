import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui";

import { formatDataCheckNumber } from "../../utils";

export type DataCheckHistoryPoint = {
  label: string;
  value: number;
  min: number;
  max: number;
};

type HistoryBandViewProps = {
  points: readonly DataCheckHistoryPoint[];
  unit: string;
};

const WIDTH = 640;
const HEIGHT = 140;
const PADDING = 12;

export function HistoryBandView({ points, unit }: HistoryBandViewProps) {
  const last = points.at(-1);
  if (last == null || points.length < 2) {
    return null;
  }
  const low = Math.min(
    ...points.map((point) => Math.min(point.value, point.min)),
  );
  const high = Math.max(
    ...points.map((point) => Math.max(point.value, point.max)),
  );
  const getX = (index: number) =>
    PADDING + (index * (WIDTH - 2 * PADDING)) / (points.length - 1);
  const getY = (value: number) =>
    HEIGHT -
    PADDING -
    ((value - low) / (high - low || 1)) * (HEIGHT - 2 * PADDING);
  const upperEdge = points.map(
    (point, index) => `${getX(index)},${getY(point.max)}`,
  );
  const lowerEdge = points
    .map((point, index) => `${getX(index)},${getY(point.min)}`)
    .reverse();
  const line = points.map(
    (point, index) => `${getX(index)},${getY(point.value)}`,
  );
  const isOutside = last.value < last.min || last.value > last.max;
  const lastColor = isOutside
    ? "var(--mb-color-feedback-negative)"
    : "var(--mb-color-feedback-positive)";

  return (
    <Stack gap="sm">
      <Group align="end" gap="sm">
        <Text
          fz="1.75rem"
          fw="bold"
          lh={1}
          c={isOutside ? "feedback-negative" : undefined}
        >
          {formatDataCheckNumber(last.value)}
        </Text>
        <Text c="text-secondary">{unit}</Text>
        <Text c="text-secondary" ml="auto">
          {t`Expected between ${formatDataCheckNumber(last.min)} and ${formatDataCheckNumber(last.max)}`}
        </Text>
      </Group>
      <Box
        component="svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        w="100%"
        role="img"
        aria-label={t`Metric per run against its expected band`}
      >
        <polygon
          points={[...upperEdge, ...lowerEdge].join(" ")}
          fill="var(--mb-color-feedback-positive)"
          opacity={0.18}
        />
        <polyline
          points={line.join(" ")}
          fill="none"
          stroke="var(--mb-color-text-secondary)"
          strokeWidth={2}
        />
        <circle
          cx={getX(points.length - 1)}
          cy={getY(last.value)}
          r={5}
          fill={lastColor}
        />
      </Box>
      <Group justify="space-between">
        <Text c="text-secondary" fz="xs">
          {points[0].label}
        </Text>
        <Text c="text-secondary" fz="xs">
          {last.label}
        </Text>
      </Group>
    </Stack>
  );
}
