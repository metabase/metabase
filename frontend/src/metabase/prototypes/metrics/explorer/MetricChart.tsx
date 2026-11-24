import { Box, Group, Stack, Text } from "metabase/ui";

import { LineChart } from "../Sparkline";
import { formatNumber } from "../data";

const CATEGORIES: Record<string, string[]> = {
  Category: ["Widget", "Gadget", "Gizmo", "Doohickey"],
  Channel: ["Online", "Retail", "Partner"],
  Region: ["EMEA", "NA", "APAC", "LATAM"],
};

/** A line over time, or bars across a category. Mock numbers. */
export function MetricChart({
  values,
  dimension,
}: {
  values: number[];
  dimension: string;
}) {
  return dimension === "Created At" || dimension === "Time" ? (
    <LineChart values={values} />
  ) : (
    <Bars values={values} dimension={dimension} />
  );
}

/** Mock split of the total across a categorical dimension. */
function Bars({ values, dimension }: { values: number[]; dimension: string }) {
  const total = values.reduce((a, b) => a + b, 0);
  const labels = CATEGORIES[dimension] ?? [];
  const shares = labels.map(
    (_, i) => (labels.length - i) / ((labels.length * (labels.length + 1)) / 2),
  );
  return (
    <Stack gap={6} py="sm">
      {labels.map((label, i) => (
        <Group key={label} gap="sm" wrap="nowrap">
          <Text size="sm" w={100}>
            {label}
          </Text>
          <Box
            h={18}
            w={`${shares[i] * 100 * 1.6}%`}
            style={{
              borderRadius: 2,
              maxWidth: "70%",
              background: "var(--mb-color-core-brand)",
            }}
          />
          <Text size="xs" c="text-secondary">
            {formatNumber(total * shares[i])}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
