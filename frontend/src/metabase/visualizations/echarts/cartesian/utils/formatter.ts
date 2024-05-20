import type { RowValue } from "metabase-types/api";

import type { RawValueFormatter } from "../model/types";

export const cachedFormatter = (formatter: RawValueFormatter) => {
  const cache = new Map();
  return (value: RowValue) => {
    if (cache.has(value)) {
      return cache.get(value);
    }

    const result = formatter(value);
    cache.set(value, result);
    return result;
  };
};
