import type { StringFilterValueCountMap } from "./types";

export const stringFilterValueCountMap: StringFilterValueCountMap = {
  "is-null": 0,
  "not-null": 0,
  "is-empty": 0,
  "not-empty": 0,
  "starts-with": 1,
  "ends-with": 1,
  contains: 1,
  "does-not-contain": 1,
  "=": "multiple",
  "!=": "multiple",
};
