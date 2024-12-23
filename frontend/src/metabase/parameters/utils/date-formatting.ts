import moment, { type Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

import {
  DATE_MBQL_FILTER_MAPPING,
  PARAMETER_OPERATOR_TYPES,
} from "metabase-lib/v1/parameters/constants";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { dateParameterValueToMBQL } from "metabase-lib/v1/parameters/utils/mbql";
import {
  DATE_OPERATORS,
  generateTimeFilterValuesDescriptions,
} from "metabase-lib/v1/queries/utils/query-time";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;
const RANGE_SEPARATOR = "~"; // URL-safe

function getFilterOperator(filter: any[] = []) {
  return DATE_OPERATORS.find(op => op.test(filter as any));
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

function formatSingleDate(date: Moment) {
  if (date.hours() || date.minutes()) {
    return date.format("MMMM D, YYYY hh:mm A");
  } else {
    return date.format("MMMM D, YYYY");
  }
}

export function formatRangeWidget(value: string): string | null {
  const { start, end } = parseDateRangeValue(value);
  return start.isValid() && end.isValid()
    ? formatSingleDate(start) + " - " + formatSingleDate(end)
    : null;
}

function formatSingleWidget(value: string): string | null {
  const m = moment(value, true);
  return m.isValid() ? formatSingleDate(m) : null;
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

// This should miror the logic in `metabase.models.params.shared`
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
