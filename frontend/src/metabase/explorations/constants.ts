import type { MetricDimension } from "metabase-types/api";

export const DIMENSION_INTERESTINGNESS_SCORE_THRESHOLD = 0.7;

export function isInterestingDimension(dimension: MetricDimension): boolean {
  return (
    (dimension.dimension_interestingness ?? 0) >=
    DIMENSION_INTERESTINGNESS_SCORE_THRESHOLD
  );
}

export const TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD = 0.7;

export const QUERY_INTERESTINGNESS_SCORE_THRESHOLD = 0.7;

export const AUTO_INSIGHTS_DOCUMENT_NAME = "Automatic Insights"; //todo should this be translated?
