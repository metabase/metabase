import { t } from "ttag";

type Warning = { key: string; text: string };

const NULL_DIMENSION_WARNING = "NULL_DIMENSION_WARNING";
export function nullDimensionWarning(): Warning {
  return {
    key: NULL_DIMENSION_WARNING,
    text: t`Data includes missing dimension values.`,
  };
}

const INVALID_DATE_WARNING = "INVALID_DATE_WARNING";
export function invalidDateWarning(value: string): Warning {
  return {
    key: INVALID_DATE_WARNING,
    text: t`We encountered an invalid date: "${value}"`,
  };
}

const UNAGGREGATED_DATA_WARNING = "UNAGGREGATED_DATA_WARNING";
export function unaggregatedDataWarning(
  col: { display_name: string },
  axis = "x",
): Warning {
  return {
    key: UNAGGREGATED_DATA_WARNING,
    text: t`"${
      col.display_name
    }" is an unaggregated field: if it has more than one value at a point on the ${axis}-axis, the values will be summed.`,
  };
}

const UNAGGREGATED_DATA_WARNING_PIE = "UNAGGREGATED_DATA_WARNING_PIE";
export function unaggregatedDataWarningPie(col: {
  display_name: string;
}): Warning {
  return {
    key: UNAGGREGATED_DATA_WARNING_PIE,
    text: t`"${
      col.display_name
    }" is an unaggregated field: if it has more than one row with the same value, their measure values will be summed.`,
  };
}

const UNEXPECTED_QUERY_TIMEZONE = "UNEXPECTED_QUERY_TIMEZONE";
export function unexpectedTimezoneWarning({
  results_timezone,
  requested_timezone,
}: {
  results_timezone: string;
  requested_timezone: string;
}): Warning {
  return {
    key: UNEXPECTED_QUERY_TIMEZONE,
    text: t`The query for this chart was run in ${results_timezone} rather than ${requested_timezone} due to database or driver constraints.`,
  };
}

const MULTIPLE_TIMEZONES = "MULTIPLE_TIMEZONES";
export function multipleTimezoneWarning(timezones: string[]): Warning {
  const tzList = timezones.join(", ");
  return {
    key: MULTIPLE_TIMEZONES,
    text: t`This chart contains queries run in multiple timezones: ${tzList}`,
  };
}

const PIE_NEGATIVES = "PIE_NEGATIVES";
export function pieNegativesWarning(): Warning {
  return {
    key: PIE_NEGATIVES,
    text: t`Negative values in measure column have been omitted from pie chart.`,
  };
}
