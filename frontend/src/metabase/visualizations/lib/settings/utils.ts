import _ from "underscore";

import {
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";
import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

export function getOptionFromColumn(col: DatasetColumn) {
  return {
    name: col.display_name,
    value: col.name,
  };
}

export function metricSetting(
  id: string,
  def: Partial<VisualizationSettingsDefinitions[string]> = {},
): VisualizationSettingsDefinitions {
  return fieldSetting(id, {
    fieldFilter: isMetric,
    getDefault: (series: Series) => getDefaultDimensionAndMetric(series).metric,
    ...def,
  });
}

export function dimensionSetting(
  id: string,
  def: Partial<VisualizationSettingsDefinitions[string]> = {},
): VisualizationSettingsDefinitions {
  return fieldSetting(id, {
    fieldFilter: isDimension,
    getDefault: (series: Series) =>
      getDefaultDimensionAndMetric(series).dimension,
    ...def,
  });
}

const DEFAULT_FIELD_FILTER = (_column: DatasetColumn) => true;

type FieldFilterFn = (column: DatasetColumn) => boolean;

export function getDefaultColumn(
  series: { data: { cols: DatasetColumn[] } }[],
  vizSettings: VisualizationSettings,
  fieldFilter: FieldFilterFn = DEFAULT_FIELD_FILTER,
): string | undefined {
  const [{ data }] = series;
  return data.cols.find(fieldFilter)?.name;
}

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
      isValid: ([{ card, data }]: Series) =>
        columnsAreValid(card.visualization_settings[id], data, fieldFilter),
      getDefault: (series: Series, vizSettings: VisualizationSettings) =>
        getDefaultColumn(series, vizSettings, fieldFilter),
      getProps: ([{ data }]: Series) => ({
        options: data.cols.filter(fieldFilter).map(getOptionFromColumn),
        columns: data.cols,
        showColumnSetting,
        autoOpenWhenUnset,
      }),
      ...def,
    },
  };
}

export function getDeduplicatedTableColumnSettings(
  tableColumnsSettings: { name: string }[],
) {
  return _.uniq(
    tableColumnsSettings,
    false,
    (item: { name: string }) => item.name,
  );
}
