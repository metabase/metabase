import type { Padding } from "metabase/visualizations/types";

export type SankeyChartLayout = {
  padding: Padding;
  nodeIndicesWithTruncatedLabels: Set<number> | null;
  truncateLabelWidth: number;
};
