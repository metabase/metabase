import _ from "underscore";

import {
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";
import type { VisualizationSettingDefinition } from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Series,
  TableColumnOrderSetting,
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
  def: Partial<VisualizationSettingDefinition<Series>> = {},
) {
  return fieldSetting(id, {
    fieldFilter: isMetric,
    getDefault: (series) => getDefaultDimensionAndMetric(series).metric,
    ...def,
  });
}

export function dimensionSetting(
  id: string,
  def: Partial<VisualizationSettingDefinition<Series>> = {},
) {
  return fieldSetting(id, {
    fieldFilter: isDimension,
    getDefault: (series) => getDefaultDimensionAndMetric(series).dimension,
    ...def,
  });
}

const DEFAULT_FIELD_FILTER = (_column: DatasetColumn) => true;

type FieldFilterFn = (column: DatasetColumn) => boolean;

export function getDefaultColumn(
  series: Series,
  _vizSettings: VisualizationSettings,
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
  }: Partial<VisualizationSettingDefinition<Series>> & {
    fieldFilter?: FieldFilterFn;
    showColumnSetting?: boolean;
    autoOpenWhenUnset?: boolean;
  } = {},
): {
  [id]: VisualizationSettingDefinition<Series>;
} {
  return {
    [id]: {
      widget: "field",
      isValid: ([{ card, data }]) =>
        columnsAreValid(card.visualization_settings[id], data, fieldFilter),
      getDefault: (series, vizSettings) =>
        getDefaultColumn(series, vizSettings, fieldFilter),
      getProps: ([{ data }]) => ({
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
  tableColumnsSettings: TableColumnOrderSetting[],
): TableColumnOrderSetting[] {
  return _.uniq(tableColumnsSettings, false, (item) => item.name);
}
