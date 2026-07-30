import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime";

export const EXPLORATION_NAME_MAX_LENGTH = 254;

export function getDefaultExplorationName() {
  return t`New research - ${getFormattedTime(new Date(), "day", { local: true })}`;
}

// keep in sync with backend other-bucket-label
export const OTHER_BUCKET_LABEL = "(Other)";
