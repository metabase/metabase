import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";
import _ from "underscore";

import { DATE_OPERATORS } from "metabase/admin/datamodel/components/filters/pickers/DatePicker/DatePicker";
import { EXCLUDE_OPERATORS } from "metabase/admin/datamodel/components/filters/pickers/DatePicker/ExcludeDatePicker";
import {
  DATE_MBQL_FILTER_MAPPING,
  PARAMETER_OPERATOR_TYPES,
} from "metabase-lib/v1/parameters/constants";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { dateParameterValueToMBQL } from "metabase-lib/v1/parameters/utils/mbql";
import {
  generateTimeFilterValuesDescriptions,
  getRelativeDatetimeInterval,
  getStartingFrom,
} from "metabase-lib/v1/queries/utils/query-time";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;
const RANGE_SEPARATOR = "~"; // URL-safe

function getFilterValueSerializer(func: (...args: any[]) => string) {
  return (filter: any[]) => {
    const startingFrom = getStartingFrom(filter);
    if (startingFrom) {
      const [value, unit] = getRelativeDatetimeInterval(filter);
      return func(value, unit, { startingFrom });
    } else {
      return func(filter[2], filter[3], filter[4] || {});
    }
  };
}

const serializersByOperatorName: Record<
  string,
  (...args: any[]) => string | null
> = {
  previous: getFilterValueSerializer((value, unit, options = {}) => {
    if (options.startingFrom) {
      const [fromValue, fromUnit] = options.startingFrom;
      return `past${-value}${unit}s-from-${fromValue}${fromUnit}s`;
    }
    return `past${-value}${unit}s${options["include-current"] ? "~" : ""}`;
  }),
  next: getFilterValueSerializer((value, unit, options = {}) => {
    if (options.startingFrom) {
      const [fromValue, fromUnit] = options.startingFrom;
      return `next${value}${unit}s-from-${-fromValue}${fromUnit}s`;
    }
    return `next${value}${unit}s${options["include-current"] ? "~" : ""}`;
  }),
  current: getFilterValueSerializer((_, unit) => `this${unit}`),
  before: getFilterValueSerializer(value => `~${value}`),
  after: getFilterValueSerializer(value => `${value}~`),
  on: getFilterValueSerializer(value => `${value}`),
  between: getFilterValueSerializer((from, to) => `${from}~${to}`),
  exclude: (filter: any[]) => {
    const [_op, _field, ...values] = filter;
    const operator = getExcludeOperator(filter);
    if (!operator || !values.length) {
      return null;
    }
    const options = operator
      .getOptions()
      .flat()
      .filter(
        ({ test }) => _.find(values, (value: string) => test(value)) != null,
      );
    return `exclude-${operator.name}-${options
      .map(({ serialized }) => serialized)
      .join("-")}`;
  },
};

function getFilterOperator(filter: any[] = []) {
  return DATE_OPERATORS.find(op => op.test(filter as any));
}

function getExcludeOperator(filter: any[] = []) {
  return EXCLUDE_OPERATORS.find(op => op.test(filter as any));
}

export function filterToUrlEncoded(filter: any[]) {
  const operator = getFilterOperator(filter);
  if (operator) {
    return serializersByOperatorName[operator.name](filter);
  } else {
    return null;
  }
}

const prefixedOperators = new Set([
  "exclude",
  "before",
  "after",
  "on",
  "empty",
  "not-empty",
]);

export function getFilterTitle(filter: any[]) {
  const values = generateTimeFilterValuesDescriptions(filter);
  const desc =
    values.length > 2
      ? t`${values.length} selections`
      : values.join(filter[0] === "!=" ? ", " : " - ");
  const op = getFilterOperator(filter);
  const prefix =
    op && prefixedOperators.has(op.name)
      ? `${op.displayPrefix ?? op.displayName} `
      : "";
  return prefix + desc;
}

export function formatAllOptionsWidget(urlEncoded: string): string | null {
  if (urlEncoded == null) {
    return null;
  }
  const filter = dateParameterValueToMBQL(urlEncoded, noopRef);
  return filter ? getFilterTitle(filter) : null;
}

function parseDateRangeValue(value: string) {
  const [start, end] = (value || "").split(RANGE_SEPARATOR);
  return { start: moment(start, true), end: moment(end, true) };
}

export function formatRangeWidget(value: string): string | null {
  const { start, end } = parseDateRangeValue(value);
  return start.isValid() && end.isValid()
    ? start.format("MMMM D, YYYY") + " - " + end.format("MMMM D, YYYY")
    : null;
}

function formatSingleWidget(value: string): string | null {
  const m = moment(value, true);
  return m.isValid() ? m.format("MMMM D, YYYY") : null;
}

function formatMonthYearWidget(value: string): string | null {
  const m = moment(value, "YYYY-MM", true);
  return m.isValid() ? m.format("MMMM YYYY") : null;
}

function formatQuarterYearWidget(value: string): string | null {
  const m = moment(value, "[Q]Q-YYYY", true);
  return m.isValid() ? m.format("[Q]Q YYYY") : null;
}

function formatRelativeWidget(value: string): string | null {
  return DATE_MBQL_FILTER_MAPPING[value]
    ? DATE_MBQL_FILTER_MAPPING[value].name
    : null;
}

export function formatDateValue(
  value: string,
  parameter: UiParameter,
): string | null {
  // the value can be from a mismatching parameter, so we need to test every date parameter type
  const types = [
    parameter.type,
    ...PARAMETER_OPERATOR_TYPES.date.map(({ type }) => type),
  ];

  return types.reduce((result: string | null, type) => {
    return result ?? formatDateValueForType(value, type);
  }, null);
}

// This should miror the logic in `metabase.shared.parameters.parameters`
export function formatDateValueForType(
  value: string,
  type: string,
): string | null {
  switch (type) {
    case "date/range":
      return formatRangeWidget(value);
    case "date/single":
      return formatSingleWidget(value);
    case "date/all-options":
      return formatAllOptionsWidget(value);
    case "date/month-year":
      return formatMonthYearWidget(value);
    case "date/quarter-year":
      return formatQuarterYearWidget(value);
    case "date/relative":
      return formatRelativeWidget(value);
    default:
      return value;
  }
}
