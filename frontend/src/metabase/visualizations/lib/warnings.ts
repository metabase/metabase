import { t } from "ttag";

export const NULL_DIMENSION_WARNING = "NULL_DIMENSION_WARNING";
export const INVALID_DATE_WARNING = "INVALID_DATE_WARNING";
export const UNAGGREGATED_DATA_WARNING = "UNAGGREGATED_DATA_WARNING";
export const UNAGGREGATED_DATA_WARNING_PIE = "UNAGGREGATED_DATA_WARNING_PIE";
export const UNEXPECTED_QUERY_TIMEZONE = "UNEXPECTED_QUERY_TIMEZONE";
export const MULTIPLE_TIMEZONES = "MULTIPLE_TIMEZONES";
export const PIE_NEGATIVES = "PIE_NEGATIVES";

export type VisualizationWarningKey =
  | typeof NULL_DIMENSION_WARNING
  | typeof INVALID_DATE_WARNING
  | typeof UNAGGREGATED_DATA_WARNING
  | typeof UNAGGREGATED_DATA_WARNING_PIE
  | typeof UNEXPECTED_QUERY_TIMEZONE
  | typeof MULTIPLE_TIMEZONES
  | typeof PIE_NEGATIVES;

export interface VisualizationWarning {
  key: VisualizationWarningKey;
  text: string;
}

export function nullDimensionWarning(): VisualizationWarning {
  return {
    key: NULL_DIMENSION_WARNING,
    text: t`Data includes missing dimension values.`,
  };
}

export function invalidDateWarning(value: unknown): VisualizationWarning {
  return {
    key: INVALID_DATE_WARNING,
    text: t`We encountered an invalid date: "${value}"`,
  };
}

export function unaggregatedDataWarning(
  col: { display_name: string },
  axis = "x",
): VisualizationWarning {
  return {
    key: UNAGGREGATED_DATA_WARNING,
    text: t`"${
      col.display_name
    }" is an unaggregated field: if it has more than one value at a point on the ${axis}-axis, the values will be summed.`,
  };
}

export function unaggregatedDataWarningPie(col: {
  display_name: string;
}): VisualizationWarning {
  return {
    key: UNAGGREGATED_DATA_WARNING_PIE,
    text: t`"${
      col.display_name
    }" is an unaggregated field: if it has more than one row with the same value, their measure values will be summed.`,
  };
}

export function unexpectedTimezoneWarning({
  results_timezone,
  requested_timezone,
}: {
  results_timezone: string;
  requested_timezone: string;
}): VisualizationWarning {
  return {
    key: UNEXPECTED_QUERY_TIMEZONE,
    text: t`The query for this chart was run in ${results_timezone} rather than ${requested_timezone} due to database or driver constraints.`,
  };
}

export function multipleTimezoneWarning(timezones: string[]): VisualizationWarning {
  const tzList = timezones.join(", ");
  return {
    key: MULTIPLE_TIMEZONES,
    text: t`This chart contains queries run in multiple timezones: ${tzList}`,
  };
}

export function pieNegativesWarning(): VisualizationWarning {
  return {
    key: PIE_NEGATIVES,
    text: t`Negative values in measure column have been omitted from pie chart.`,
  };
}
