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

type AggregatedTreemapValues = {
  rawValueByKey: Map<string, RowValue>;
  currentKeys: string[];
};

type NameFormatter = (rawValue: RowValue) => string;

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
  const { rawValueByKey, currentKeys } = aggregateRowsByKey({
    rows,
    groupingIndex: grouping.index,
    valueIndex: value.index,
  });
  const colors = getColorsForValues(currentKeys);
  const groupingColumnSettings = settings["column"]?.(grouping.column);
  const formatName = createNameFormatter({
    groupingColumnSettings,
    formatter,
  });

  const savedRows = settings["treemap.rows"] ?? [];
  const savedRowByKey = new Map(savedRows.map((row) => [row.key, row]));
  const newRows = buildCurrentRows({
    currentKeys,
    savedRowByKey,
    rawValueByKey,
    colors,
    formatName,
  });

  addHiddenSavedRows({ rows: newRows, savedRows, currentKeys });

  return newRows;
}

function aggregateRowsByKey({
  rows,
  groupingIndex,
  valueIndex,
}: {
  rows: RowValue[][];
  groupingIndex: number;
  valueIndex: number;
}): AggregatedTreemapValues {
  const valueByKey = new Map<string, number>();
  const rawValueByKey = new Map<string, RowValue>();

  rows.forEach((row) => {
    const rawValue = row[groupingIndex];
    const key = getKeyFromDimensionValue(rawValue);
    const metricValue = getNumberOr(row[valueIndex], 0);
    const newValue = (valueByKey.get(key) ?? 0) + metricValue;
    valueByKey.set(key, newValue);
    if (!rawValueByKey.has(key)) {
      rawValueByKey.set(key, rawValue);
    }
  });

  const currentKeys = Array.from(valueByKey.keys()).sort(
    (keyA, keyB) => (valueByKey.get(keyB) ?? 0) - (valueByKey.get(keyA) ?? 0),
  );

  return { rawValueByKey, currentKeys };
}

function createNameFormatter({
  groupingColumnSettings,
  formatter,
}: {
  groupingColumnSettings:
    | ReturnType<NonNullable<ComputedVisualizationSettings["column"]>>
    | undefined;
  formatter: Formatter;
}): NameFormatter {
  return (rawValue: RowValue) => {
    if (rawValue == null) {
      return NULL_DISPLAY_VALUE;
    }
    return formatter(rawValue, groupingColumnSettings) ?? NULL_DISPLAY_VALUE;
  };
}

function buildCurrentRows({
  currentKeys,
  savedRowByKey,
  rawValueByKey,
  colors,
  formatName,
}: {
  currentKeys: string[];
  savedRowByKey: Map<string, TreemapRow>;
  rawValueByKey: Map<string, RowValue>;
  colors: ReturnType<typeof getColorsForValues>;
  formatName: (rawValue: RowValue) => string;
}): TreemapRow[] {
  return currentKeys.map((key) => {
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
}

function addHiddenSavedRows({
  rows,
  savedRows,
  currentKeys,
}: {
  rows: TreemapRow[];
  savedRows: TreemapRow[];
  currentKeys: string[];
}) {
  const currentKeySet = new Set(currentKeys);
  savedRows.forEach((savedRow) => {
    if (!currentKeySet.has(savedRow.key)) {
      rows.push({
        ...savedRow,
        enabled: savedRow.enabled !== false,
        hidden: true,
      });
    }
  });
}
