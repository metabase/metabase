import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type { TreemapChartColumns, TreemapTree } from "./types";
import { getTreemapTotal } from "./value";

export interface TreemapFormatters {
  value: (value: number) => string;
  percent: (ratio: number) => string;
}

export function getTreemapFormatters(
  columns: TreemapChartColumns,
  settings: ComputedVisualizationSettings,
): TreemapFormatters {
  const valueColumn = columns.value.column;
  return {
    value: getTreemapColumnFormatter(valueColumn, settings),
    percent: (ratio: number) =>
      String(
        formatValue(ratio, {
          column: valueColumn,
          number_style: "percent",
          decimals: Math.abs(ratio) === 1 ? 0 : 2,
        }),
      ),
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

export function getTreemapPercentOfTotalFormatter(
  tree: TreemapTree,
  formatPercent: (ratio: number) => string,
) {
  const total = getTreemapTotal(tree);

  return (value: number) => formatPercent(total === 0 ? 0 : value / total);
}
