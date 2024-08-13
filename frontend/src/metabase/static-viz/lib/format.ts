import type { NumberLike, StringLike } from "@visx/scale";
import moment from "moment"; // eslint-disable-line no-restricted-imports -- deprecated usage
import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import {
  formatDateTimeWithUnit,
  formatRange,
} from "metabase/lib/formatting/date";
import { formatCoordinate } from "metabase/lib/formatting/geography";
import { formatNumber } from "metabase/lib/formatting/numbers";
import { formatTime } from "metabase/lib/formatting/time";
import type { OptionsType } from "metabase/lib/formatting/types";
import { getFormattingOptionsWithoutScaling } from "metabase/visualizations/echarts/cartesian/model/util";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import type {
  ChartTicksFormatters,
  ValueFormatter,
} from "metabase/visualizations/shared/types/format";
import { getLabelsMetricColumn } from "metabase/visualizations/shared/utils/series";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import { rangeForValue } from "metabase-lib/v1/queries/utils/range-for-value";
import {
  isCoordinate,
  isDate,
  isNumber,
  isTime,
  isBoolean,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

const getRemappedValue = (
  value: unknown,
  column: RemappingHydratedDatasetColumn,
) => {
  if (column.remapping instanceof Map && column.remapping.has(value)) {
    return column.remapping.get(value);
  }

  return value;
};

// Literally simplified copy of frontend/src/metabase/lib/formatting/value.tsx that excludes
// click behavior, any html formatting, any code uses globals or that imports packages which use globals.
// The reason for that is inability to use highly-coupled formatting code from the main app for static viz
// because it crashes while using it in the GraalVM SSR
export const formatStaticValue = (value: unknown, options: OptionsType) => {
  const { prefix, suffix, column } = options;

  let formattedValue = null;

  if (value == null) {
    formattedValue = JSON.stringify(null);
  } else if (isTime(column)) {
    formattedValue = formatTime(value as Moment, column.unit, options);
  } else if (column?.unit != null) {
    formattedValue = formatDateTimeWithUnit(
      value as string | number,
      column.unit,
      options,
    );
  } else if (
    isDate(column) ||
    moment.isDate(value) ||
    moment.isMoment(value) ||
    moment(value as string, ["YYYY-MM-DD'T'HH:mm:ss.SSSZ"], true).isValid()
  ) {
    formattedValue = formatDateTimeWithUnit(
      value as string | number,
      "minute",
      options,
    );
  } else if (column?.semantic_type && typeof value === "string") {
    formattedValue = value;
  } else if (typeof value === "number" && isCoordinate(column)) {
    const range = rangeForValue(value, column);
    formattedValue = formatRange(range ?? [], formatCoordinate, options);
  } else if (typeof value === "number" && isNumber(column)) {
    const range = rangeForValue(value, column);
    if (range && !options.noRange) {
      formattedValue = formatRange(range, formatNumber, options);
    } else {
      formattedValue = formatNumber(value, options);
    }
  } else if (typeof value === "boolean" && isBoolean(column)) {
    formattedValue = JSON.stringify(value);
  } else if (typeof value === "object") {
    // no extra whitespace for table cells
    formattedValue = JSON.stringify(value);
  } else {
    formattedValue = String(value);
  }

  if (prefix || suffix) {
    return `${prefix || ""}${formattedValue}${suffix || ""}`;
  }

  return formattedValue;
};

export const getStaticFormatters = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ChartTicksFormatters => {
  const yTickFormatter = (value: StringLike) => {
    const column = chartColumns.dimension.column;
    const columnSettings = getColumnSettings(settings, column);
    const valueToFormat = getRemappedValue(value, column);

    const options = getFormattingOptionsWithoutScaling({
      column,
      ...columnSettings,
      jsx: false,
    });

    return String(formatStaticValue(valueToFormat, options));
  };

  const metricColumn = getLabelsMetricColumn(chartColumns);

  const percentXTicksFormatter = (percent: NumberLike) => {
    const column = metricColumn.column;
    const number_separators = getColumnSettings(
      settings,
      column,
    )?.number_separators;

    const options = getFormattingOptionsWithoutScaling({
      column,
      number_separators,
      jsx: false,
      number_style: "percent",
      decimals: 2,
    });

    return String(formatStaticValue(percent, options));
  };

  const xTickFormatter = (value: NumberLike) => {
    const column = metricColumn.column;
    const columnSettings = getColumnSettings(settings, column);
    const valueToFormat = getRemappedValue(value, column);

    const options = getFormattingOptionsWithoutScaling({
      column,
      ...columnSettings,
      jsx: false,
    });

    return String(formatStaticValue(valueToFormat, options));
  };

  const shouldFormatXTicksAsPercent = getStackOffset(settings) === "expand";

  return {
    yTickFormatter,
    xTickFormatter: shouldFormatXTicksAsPercent
      ? percentXTicksFormatter
      : xTickFormatter,
  };
};

export const getLabelsStaticFormatter = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ValueFormatter => {
  const column = getLabelsMetricColumn(chartColumns).column;
  const columnSettings = getColumnSettings(settings, column);
  const options = getFormattingOptionsWithoutScaling({
    column,
    ...columnSettings,
    jsx: false,
    compact: settings["graph.label_value_formatting"] === "compact",
  });

  const labelsFormatter = (value: any) =>
    String(formatStaticValue(value, options));

  return labelsFormatter;
};

export const getColumnValueStaticFormatter = () => {
  return (value: RowValue, column: DatasetColumn) => {
    const valueToFormat = getRemappedValue(value, column);
    return String(formatStaticValue(valueToFormat, { column }));
  };
};
