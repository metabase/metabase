import { memoize } from "metabase/common/hooks/use-memoized-callback";
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
  return {
    value: memoize((value: number) =>
      String(formatValue(value, settings.column?.(columns.value.column) ?? {})),
    ),
  };
}
