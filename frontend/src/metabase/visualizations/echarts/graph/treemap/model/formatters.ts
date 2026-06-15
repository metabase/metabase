import { formatPercent } from "metabase/static-viz/lib/numbers";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type { TreemapChartColumns, TreemapTree } from "./types";
import { getTreemapTotal } from "./value";

export interface TreemapFormatters {
  value: (value: number) => string;
}

export function getTreemapFormatters(
  columns: TreemapChartColumns,
  settings: ComputedVisualizationSettings,
): TreemapFormatters {
  return {
    value: getTreemapColumnFormatter(columns.value.column, settings),
  };
}

export function getTreemapColumnFormatter(
  column: DatasetColumn,
  settings?: Pick<ComputedVisualizationSettings, "column">,
) {
  const columnSettings = settings?.column?.(column);

  return (value: RowValue): string => {
    if (value == null) {
      return NULL_DISPLAY_VALUE;
    }

    return String(
      formatValue(value, {
        ...columnSettings,
        column,
      }) ?? NULL_DISPLAY_VALUE,
    );
  };
}

export function getTreemapPercentOfTotalFormatter(tree: TreemapTree) {
  const total = getTreemapTotal(tree);

  return (value: number) => formatPercent(total === 0 ? 0 : value / total);
}
