import type { Padding } from "metabase/viz-core/types";

export type SankeyChartLayout = {
  padding: Padding;
  nodeIndicesWithTruncatedLabels: Set<number> | null;
  truncateLabelWidth: number;
  labelValueFormatting: "compact" | "full" | null;
};
