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
import type {
  DatasetColumn,
  Series,
  VisualizationSettingId,
} from "metabase-types/api";

import { isDimension, isMetric } from "metabase-lib/types/utils/isa";

export function getOptionFromColumn(col: DatasetColumn) {
  return {
    name: getFriendlyName(col),
    value: col.name,
  };
}

export function metricSetting(
  id: VisualizationSettingId,
  def: VisualizationSettingDefinition = {},
) {
  return fieldSetting(id, {
    fieldFilter: isMetric,
    getDefault: series => getDefaultDimensionAndMetric(series).metric,
    ...def,
  });
}

export function dimensionSetting(
  id: VisualizationSettingId,
  def: VisualizationSettingDefinition = {},
) {
  return fieldSetting(id, {
    fieldFilter: isDimension,
    getDefault: series => getDefaultDimensionAndMetric(series).dimension,
    ...def,
  });
}

const DEFAULT_FIELD_FILTER = () => true;

export function fieldSetting(
  id: VisualizationSettingId,
  {
    fieldFilter = DEFAULT_FIELD_FILTER,
    showColumnSetting,
    ...def
  }: VisualizationSettingDefinition & {
    fieldFilter?: () => boolean;
    showColumnSetting?: boolean;
  } = {},
): VisualizationSettingsDefinitions<Series> {
  return {
    [id]: {
      widget: "field",
      isValid: ([{ card, data }]: Series) =>
        columnsAreValid(card.visualization_settings[id], data, fieldFilter),
      getDefault: ([{ data }]: Series) =>
        (_.find(data.cols, fieldFilter) || {}).name,
      getProps: ([{ card, data }]: Series) => ({
        options: data.cols.filter(fieldFilter).map(getOptionFromColumn),
        columns: data.cols,
        showColumnSetting: showColumnSetting,
      }),
      ...def,
    },
  };
}
