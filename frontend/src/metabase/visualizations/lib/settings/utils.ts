import _ from "underscore";

import {
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";
import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

import type { DatasetColumn } from "metabase-types/api";

export function getOptionFromColumn(col: DatasetColumn): { name: string; value: string } {
  return {
    name: col.display_name,
    value: col.name,
  };
}

export function metricSetting(
  id: string,
  def: Partial<VisualizationSettingsDefinitions[string]> & {
    fieldFilter?: (column: DatasetColumn) => boolean;
  } = {},
): VisualizationSettingsDefinitions {
  return fieldSetting(id, {
    fieldFilter: isMetric,
    getDefault: (series) => getDefaultDimensionAndMetric(series).metric,
    ...def,
  });
}

export function dimensionSetting(
  id: string,
  def: Partial<VisualizationSettingsDefinitions[string]> & {
    fieldFilter?: (column: DatasetColumn) => boolean;
  } = {},
): VisualizationSettingsDefinitions {
  return fieldSetting(id, {
    fieldFilter: isDimension,
    getDefault: (series) => getDefaultDimensionAndMetric(series).dimension,
    ...def,
  });
}

const DEFAULT_FIELD_FILTER = (_column: DatasetColumn) => true;

export function getDefaultColumn(
  series: { data: { cols: DatasetColumn[] } }[],
  vizSettings: Record<string, unknown>,
  fieldFilter: (column: DatasetColumn) => boolean = DEFAULT_FIELD_FILTER,
): string | undefined {
  const [{ data }] = series;
  return data.cols.find(fieldFilter)?.name;
}

export type FieldFilterFn = (column: DatasetColumn) => boolean;

export function fieldSetting(
  id: string,
  {
    fieldFilter = DEFAULT_FIELD_FILTER,
    showColumnSetting,
    autoOpenWhenUnset,
    ...def
  }: Partial<VisualizationSettingsDefinitions[string]> & {
    fieldFilter?: FieldFilterFn;
    showColumnSetting?: boolean;
    autoOpenWhenUnset?: boolean;
  } = {},
): VisualizationSettingsDefinitions {
  return {
    [id]: {
      widget: "field",
      isValid: ([{ card, data }]: { card: { visualization_settings?: Record<string, unknown> }; data: { cols: DatasetColumn[] } }[], vizSettings: Record<string, unknown>) =>
        columnsAreValid(
          card.visualization_settings?.[id] as string | string[],
          data,
          fieldFilter,
        ),
      getDefault: (series, vizSettings) =>
        getDefaultColumn(series, vizSettings, fieldFilter),
      getProps: ([{ card, data }]: { data: { cols: DatasetColumn[] } }[], _vizSettings: Record<string, unknown>) => ({
        options: data.cols.filter(fieldFilter).map(getOptionFromColumn),
        columns: data.cols,
        showColumnSetting,
        autoOpenWhenUnset,
      }),
      ...def,
    },
  };
}

export function getDeduplicatedTableColumnSettings<T extends { name: string }>(
  tableColumnsSettings: T[],
): T[] {
  return _.uniq(tableColumnsSettings, false, (item) => item.name);
}
