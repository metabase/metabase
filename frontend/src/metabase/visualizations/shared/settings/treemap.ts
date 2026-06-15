import { getColorsForValues } from "metabase/ui/colors/charts";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { getTreemapChartColumns } from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import type {
  ComputedVisualizationSettings,
  Formatter,
} from "metabase/visualizations/types";
import type { RawSeries, RowValue, TreemapRow } from "metabase-types/api";

import { getKeyFromDimensionValue } from "./pie";

export function getTreemapRows(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  formatter: Formatter,
): TreemapRow[] {
  const [
    {
      data: { rows, cols },
    },
  ] = rawSeries;

  const treemapColumns = getTreemapChartColumns(cols, settings);
  if (treemapColumns == null) {
    return [];
  }
  const { grouping, value } = treemapColumns;

  const valueByKey = new Map<string, number>();
  const rawValueByKey = new Map<string, RowValue>();
  rows.forEach((row) => {
    const rawValue = row[grouping.index];
    const key = getKeyFromDimensionValue(rawValue);
    valueByKey.set(
      key,
      (valueByKey.get(key) ?? 0) + getNumberOr(row[value.index], 0),
    );
    if (!rawValueByKey.has(key)) {
      rawValueByKey.set(key, rawValue);
    }
  });

  const currentKeys = Array.from(valueByKey.keys()).sort(
    (keyA, keyB) => (valueByKey.get(keyB) ?? 0) - (valueByKey.get(keyA) ?? 0),
  );
  const colors = getColorsForValues(currentKeys);

  const groupingColumnSettings = settings["column"]?.(grouping.column);
  const formatName = (rawValue: RowValue) => {
    if (rawValue == null) {
      return NULL_DISPLAY_VALUE;
    }
    return formatter(rawValue, groupingColumnSettings) ?? NULL_DISPLAY_VALUE;
  };

  const savedRows = settings["treemap.rows"] ?? [];
  const savedRowByKey = new Map(savedRows.map((row) => [row.key, row]));

  const newRows: TreemapRow[] = currentKeys.map((key) => {
    const savedRow = savedRowByKey.get(key);
    if (savedRow != null) {
      return {
        ...savedRow,
        enabled: savedRow.enabled !== false,
        hidden: false,
        ...(savedRow.defaultColor ? { color: colors[key] } : {}),
      };
    }
    const name = formatName(rawValueByKey.get(key) ?? null);
    return {
      key,
      name,
      originalName: name,
      color: colors[key],
      defaultColor: true,
      enabled: true,
      hidden: false,
    };
  });

  const currentKeySet = new Set(currentKeys);
  savedRows.forEach((savedRow) => {
    if (!currentKeySet.has(savedRow.key)) {
      newRows.push({
        ...savedRow,
        enabled: savedRow.enabled !== false,
        hidden: true,
      });
    }
  });

  return newRows;
}
