import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { formatValue } from "metabase/value-formatting";
import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type { TreemapChartColumns, TreemapTree } from "./types";
import { getTreemapTotal } from "./value";

export interface TreemapFormatters {
  value: (value: number) => string;
  percent: (ratio: number) => string;
}

const DEFAULT_PERCENT_DECIMALS = 2;
const PERCENT_SIGNIFICANT_DIGITS = 2;

function getPercentDecimals(tree: TreemapTree): number {
  const total = getTreemapTotal(tree);
  if (total === 0) {
    return DEFAULT_PERCENT_DECIMALS;
  }

  const shares = tree.flatMap((root) => [
    root.value / total,
    ...(root.children ?? []).map((leaf) => leaf.value / total),
  ]);

  const decimals = computeMaxDecimalsForValues(shares, {
    style: "percent",
    maximumSignificantDigits: PERCENT_SIGNIFICANT_DIGITS,
  });

  return Math.max(
    DEFAULT_PERCENT_DECIMALS,
    decimals ?? DEFAULT_PERCENT_DECIMALS,
  );
}

export function getTreemapFormatters(
  columns: TreemapChartColumns,
  settings: ComputedVisualizationSettings,
  tree: TreemapTree,
): TreemapFormatters {
  const valueColumn = columns.value.column;
  const percentDecimals = getPercentDecimals(tree);
  return {
    value: getTreemapColumnFormatter(valueColumn, settings),
    percent: (ratio: number) =>
      String(
        formatValue(ratio, {
          column: valueColumn,
          number_style: "percent",
          decimals: Math.abs(ratio) === 1 ? 0 : percentDecimals,
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
