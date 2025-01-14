import type { RowValue } from "metabase-types/api";

type BaseFormatter = (value: unknown) => unknown;

export const cachedFormatter = <TFormatter extends BaseFormatter>(
  formatter: TFormatter,
) => {
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
