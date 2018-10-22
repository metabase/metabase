import { isDimension, isMetric } from "metabase/lib/schema_metadata";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

export const DIMENSION_METRIC = "DIMENSION_METRIC";
export const DIMENSION_METRIC_METRIC = "DIMENSION_METRIC_METRIC";
export const DIMENSION_DIMENSION_METRIC = "DIMENSION_DIMENSION_METRIC";

// NOTE Atte Keinänen 7/31/17 Commented MAX_SERIES out as it wasn't being used
// const MAX_SERIES = 10;

export const isDimensionMetric = (cols, strict = true) =>
  (!strict || cols.length === 2) && isDimension(cols[0]) && isMetric(cols[1]);

export const isDimensionDimensionMetric = (cols, strict = true) =>
  (!strict || cols.length === 3) &&
  isDimension(cols[0]) &&
  isDimension(cols[1]) &&
  isMetric(cols[2]);

export const isDimensionMetricMetric = (cols, strict = true) =>
  cols.length >= 3 &&
  isDimension(cols[0]) &&
  cols.slice(1).reduce((acc, col) => acc && isMetric(col), true);

export function getChartTypeFromData(cols, rows, strict = true) {
  // this should take precendence for backwards compatibilty
  if (isDimensionMetricMetric(cols, strict)) {
    return DIMENSION_METRIC_METRIC;
  } else if (isDimensionDimensionMetric(cols, strict)) {
    // if (getColumnCardinality(cols, rows, 0) < MAX_SERIES || getColumnCardinality(cols, rows, 1) < MAX_SERIES) {
    return DIMENSION_DIMENSION_METRIC;
    // }
  } else if (isDimensionMetric(cols, strict)) {
    return DIMENSION_METRIC;
  }
  return null;
}

// NOTE Atte Keinänen 8/3/17: Moved from settings.js because this way we
// are able to avoid circular dependency errors in integrated tests
export function columnsAreValid(colNames, data, filter = () => true) {
  if (typeof colNames === "string") {
    colNames = [colNames];
  }
  if (!data || !Array.isArray(colNames)) {
    return false;
  }
  const colsByName = {};
  for (const col of data.cols) {
    colsByName[col.name] = col;
  }
  return colNames.reduce(
    (acc, name) =>
      acc &&
      (name == undefined || (colsByName[name] && filter(colsByName[name]))),
    true,
  );
}

export function getDefaultDimensionAndMetric([{ data }]) {
  const type = data && getChartTypeFromData(data.cols, data.rows, false);
  if (type === DIMENSION_METRIC) {
    return {
      dimension: data.cols[0].name,
      metric: data.cols[1].name,
    };
  } else if (type === DIMENSION_DIMENSION_METRIC) {
    return {
      dimension: null,
      metric: data.cols[2].name,
    };
  } else {
    return {
      dimension: null,
      metric: null,
    };
  }
}

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
      getProps: ([{ card, data: { cols } }], vizSettings) => ({
        options: cols.filter(fieldFilter).map(getOptionFromColumn),
        columns: cols,
        showColumnSetting: showColumnSetting,
      }),
      ...def,
    },
  };
}
