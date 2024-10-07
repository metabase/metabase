import { t } from "ttag";
import _ from "underscore";

import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { getCollectionPathAsString } from "metabase/collections/utils";

import type { CacheableItem } from "../types";

export const formatValueForSorting = (
  row: CacheableItem,
  columnName: string,
) => {
  if (columnName === "policy") {
    const label = getShortStrategyLabel(row.strategy, row.model);
    if (row.strategy.type === "duration") {
      // Sort durations in ascending order of length
      return label?.replace(/(\d+)h/, (_, num) => {
        const paddedNumber = num.padStart(5, "0");
        return `${t`Duration`} ${paddedNumber}`;
      });
    } else {
      return label;
    }
  }
  if (columnName === "collection") {
    return row.collection ? getCollectionPathAsString(row.collection) : "";
  } else {
    return _.get(row, columnName);
  }
};
