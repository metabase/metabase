import { formatValue } from "metabase/visualizations/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import type { TreemapChartColumns } from "./types";

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
