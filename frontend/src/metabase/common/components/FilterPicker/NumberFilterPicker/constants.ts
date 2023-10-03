import type { NumberFilterValueCountMap } from "./types";

export const numberFilterValueCountMap: NumberFilterValueCountMap = {
  "is-null": 0,
  "not-null": 0,
  ">": 1,
  ">=": 1,
  "<": 1,
  "<=": 1,
  between: 2,
  "=": "multiple",
  "!=": "multiple",
};
