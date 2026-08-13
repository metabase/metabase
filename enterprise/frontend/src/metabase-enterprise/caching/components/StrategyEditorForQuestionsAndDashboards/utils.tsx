import { t } from "ttag";
import _ from "underscore";

import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { getCollectionPathAsString } from "metabase/common/collections/utils";
import { CacheDurationUnit } from "metabase-types/api";

import type { CacheableItem } from "../types";

const DURATION_UNIT_SECONDS: Record<CacheDurationUnit, number> = {
  [CacheDurationUnit.Seconds]: 1,
  [CacheDurationUnit.Minutes]: 60,
  [CacheDurationUnit.Hours]: 3600,
  [CacheDurationUnit.Days]: 86400,
};

export const formatValueForSorting = (
  row: CacheableItem,
  columnName: string,
) => {
  if (columnName === "policy") {
    if (row.strategy.type === "duration") {
      // Sort durations in ascending order of length
      const seconds =
        row.strategy.duration * DURATION_UNIT_SECONDS[row.strategy.unit];
      return `${t`Duration`} ${String(seconds).padStart(12, "0")}`;
    }
    return getShortStrategyLabel(row.strategy, row.model);
  }
  if (columnName === "collection") {
    return row.collection ? getCollectionPathAsString(row.collection) : "";
  } else {
    return _.get(row, columnName);
  }
};
