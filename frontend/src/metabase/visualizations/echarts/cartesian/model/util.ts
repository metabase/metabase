import {
  NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX,
  POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX,
} from "../constants/dataset";

import type { DataKey } from "./types";

export function getBarSeriesDataLabelKey(dataKey: DataKey, sign: "+" | "-") {
  if (sign === "+") {
    return `${dataKey}_${POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX}`;
  }
  return `${dataKey}_${NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX}`;
}
