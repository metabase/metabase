import { t } from "ttag";

import type { DatasetColumn } from "metabase-types/api";

const NULL_DIMENSION_WARNING = "NULL_DIMENSION_WARNING";
const INVALID_DATE_WARNING = "INVALID_DATE_WARNING";
const UNAGGREGATED_DATA_WARNING = "UNAGGREGATED_DATA_WARNING";
const UNAGGREGATED_DATA_WARNING_PIE = "UNAGGREGATED_DATA_WARNING_PIE";
const UNEXPECTED_QUERY_TIMEZONE = "UNEXPECTED_QUERY_TIMEZONE";
const MULTIPLE_TIMEZONES = "MULTIPLE_TIMEZONES";
const PIE_NEGATIVES = "PIE_NEGATIVES";

type VisualizationWarningKey =
  | typeof NULL_DIMENSION_WARNING
  | typeof INVALID_DATE_WARNING
  | typeof UNAGGREGATED_DATA_WARNING
  | typeof UNAGGREGATED_DATA_WARNING_PIE
  | typeof UNEXPECTED_QUERY_TIMEZONE
  | typeof MULTIPLE_TIMEZONES
  | typeof PIE_NEGATIVES;

export type VisualizationWarning = {
  key: VisualizationWarningKey;
  text: string;
};

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
  column: DatasetColumn,
  axis = "x",
): VisualizationWarning {
  return {
    key: UNAGGREGATED_DATA_WARNING,
    text: t`"${
      column.display_name
    }" is an unaggregated field: if it has more than one value at a point on the ${axis}-axis, the values will be summed.`,
  };
}

export function unaggregatedDataWarningPie(
  column: DatasetColumn,
): VisualizationWarning {
  return {
    key: UNAGGREGATED_DATA_WARNING_PIE,
    text: t`"${
      column.display_name
    }" is an unaggregated field: if it has more than one row with the same value, their measure values will be summed.`,
  };
}

export function unexpectedTimezoneWarning({
  results_timezone,
  requested_timezone,
}: {
  results_timezone: string | undefined;
  requested_timezone: string | undefined;
}): VisualizationWarning {
  return {
    key: UNEXPECTED_QUERY_TIMEZONE,
    text: t`The query for this chart was run in ${results_timezone} rather than ${requested_timezone} due to database or driver constraints.`,
  };
}

export function multipleTimezoneWarning(
  timezones: (string | undefined)[],
): VisualizationWarning {
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
