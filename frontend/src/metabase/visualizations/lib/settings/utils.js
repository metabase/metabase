import _ from "underscore";

import { isDimension, isMetric } from "metabase/lib/schema_metadata";
import {
  getFriendlyName,
  columnsAreValid,
  getDefaultDimensionAndMetric,
} from "metabase/visualizations/lib/utils";

export function getOptionFromColumn(col) {
  return {
    name: getFriendlyName(col),
    value: col.name,
  };
}

export function metricSetting(id, def = {}) {
  return fieldSetting(id, {
    fieldFilter: isMetric,
    getDefault: series => getDefaultDimensionAndMetric(series).metric,
    ...def,
  });
}

export function dimensionSetting(id, def = {}) {
  return fieldSetting(id, {
    fieldFilter: isDimension,
    getDefault: series => getDefaultDimensionAndMetric(series).dimension,
    ...def,
  });
}

const DEFAULT_FIELD_FILTER = () => true;

export function fieldSetting(
  id,
  { fieldFilter = DEFAULT_FIELD_FILTER, showColumnSetting, ...def } = {},
) {
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
