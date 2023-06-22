import { t } from "ttag";
import _ from "underscore";
import moment from "moment-timezone";

import { DATE_OPERATORS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { EXCLUDE_OPERATORS } from "metabase/query_builder/components/filters/pickers/DatePicker/ExcludeDatePicker";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";
import { DATE_MBQL_FILTER_MAPPING } from "metabase-lib/parameters/constants";
import {
  generateTimeFilterValuesDescriptions,
  getRelativeDatetimeInterval,
  getStartingFrom,
} from "metabase-lib/queries/utils/query-time";

import { UiParameter } from "metabase-lib/parameters/types";

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

function getFilterTitle(filter: any[]) {
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

export function formatAllOptionsWidget(urlEncoded: string) {
  if (urlEncoded == null) {
    return null;
  }
  const filter = dateParameterValueToMBQL(urlEncoded, noopRef);

  return filter ? getFilterTitle(filter) : null;
}

function parseDateRangeValue(value: string) {
  const [start, end] = (value || "").split(RANGE_SEPARATOR);
  return { start, end };
}

export function formatRangeWidget(value: string) {
  const { start, end } = parseDateRangeValue(value);
  return start && end
    ? moment(start).format("MMMM D, YYYY") +
        " - " +
        moment(end).format("MMMM D, YYYY")
    : "";
}

export function formatSingleWidget(value: string) {
  return value ? moment(value).format("MMMM D, YYYY") : "";
}

export function formatMonthYearWidget(value: string) {
  const m = moment(value, "YYYY-MM");
  return m.isValid() ? m.format("MMMM, YYYY") : "";
}

export function formatQuarterYearWidget(value: string) {
  const m = moment(value, "[Q]Q-YYYY");
  return m.isValid() ? m.format("[Q]Q, YYYY") : "";
}

export function formatRelativeWidget(value: string) {
  return DATE_MBQL_FILTER_MAPPING[value]
    ? DATE_MBQL_FILTER_MAPPING[value].name
    : "";
}

// This should miror the logic in `metabase.shared.parameters.parameters`
export function formatDateValue(value: string, parameter: UiParameter) {
  switch (parameter.type) {
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
