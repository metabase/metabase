import { t } from "ttag";
import type { CoordinateFilterValueCountMap } from "./types";

// why doesn't mbql recognize is-null not-null for coordinates?
export const coordinateFilterValueCountMap: CoordinateFilterValueCountMap = {
  ">": 1,
  ">=": 1,
  "<": 1,
  "<=": 1,
  between: 2,
  inside: 4,
  "=": "multiple",
  "!=": "multiple",
};

export const insideLabels = [
  t`Upper latitude`,
  t`Left longitude`,
  t`Right longitude`,
  t`Lower latitude`,
];
