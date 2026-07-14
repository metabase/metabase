import dayjs from "dayjs";
import { t } from "ttag";

import type { MetricDimension } from "metabase-types/api";

export const DIMENSION_INTERESTINGNESS_SCORE_THRESHOLD = 0.8;

export function isInterestingDimension(dimension: MetricDimension): boolean {
  return (
    (dimension.dimension_interestingness ?? 0) >=
    DIMENSION_INTERESTINGNESS_SCORE_THRESHOLD
  );
}

export const TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD = 0.7;

export const EXPLORATION_NAME_MAX_LENGTH = 254;

export function getDefaultExplorationName() {
  return t`New research - ${dayjs().local().format("MMMM D, YYYY")}`;
}

// keep in sync with backend other-bucket-label
export const OTHER_BUCKET_LABEL = "(Other)";
