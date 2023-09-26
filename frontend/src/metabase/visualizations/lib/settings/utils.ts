import _ from "underscore";
import {
  getFriendlyName,
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";

import type {
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

import { isDimension, isMetric } from "metabase-lib/types/utils/isa";

export function getOptionFromColumn(col: DatasetColumn) {
  return {
    name: getFriendlyName(col),
    value: col.name,
  };
}

export function metricSetting(
  id: string,
  def: VisualizationSettingDefinition<unknown, unknown> = {},
) {
  return fieldSetting(id, {
    fieldFilter: isMetric,
    getDefault: series => getDefaultDimensionAndMetric(series).metric,
    ...def,
  });
}

export function dimensionSetting(id: string, def = {}) {
  return fieldSetting(id, {
    fieldFilter: isDimension,
    getDefault: series => getDefaultDimensionAndMetric(series).dimension,
    ...def,
  });
}

const DEFAULT_FIELD_FILTER = () => true;

export function fieldSetting(
  id: string,
  {
    fieldFilter = DEFAULT_FIELD_FILTER,
    showColumnSetting,
    ...def
  }: VisualizationSettingDefinition<unknown, unknown> & {
    fieldFilter?: () => boolean;
    showColumnSetting?: boolean;
  } = {},
): VisualizationSettingsDefinitions {
  return {
    [id]: {
      widget: "field",
      isValid: ([{ card, data }], vizSettings) =>
        columnsAreValid(card.visualization_settings[id], data, fieldFilter),
      getDefault: ([{ data }]) => (_.find(data.cols, fieldFilter) || {}).name,
      getProps: ([{ card, data }], vizSettings) => ({
        options: data.cols.filter(fieldFilter).map(getOptionFromColumn),
        columns: data.cols,
        showColumnSetting: showColumnSetting,
      }),
      ...def,
    },
  };
}
