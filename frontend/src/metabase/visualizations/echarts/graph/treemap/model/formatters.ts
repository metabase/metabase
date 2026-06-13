import { formatPercent } from "metabase/static-viz/lib/numbers";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { getTreemapTotal } from "./data";
import type { TreemapChartColumns, TreemapTree } from "./types";

export interface TreemapFormatters {
  value: (value: number) => string;
}

export function getTreemapFormatters(
  columns: TreemapChartColumns,
  settings: ComputedVisualizationSettings,
): TreemapFormatters {
  const columnSettings = settings.column?.(columns.value.column) ?? {};
  return {
    value: (value: number) => String(formatValue(value, columnSettings)),
  };
}

export function getTreemapPercentOfTotalFormatter(tree: TreemapTree) {
  const total = getTreemapTotal(tree);

  return (value: number) => formatPercent(total === 0 ? 0 : value / total);
}
