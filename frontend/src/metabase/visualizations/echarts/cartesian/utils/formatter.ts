import type { RowValue } from "metabase-types/api";

export type BaseFormatter<T = unknown, R = unknown> = (value: T) => R;

export const cachedFormatter = <T extends RowValue, R>(
  formatter: BaseFormatter<T, R>,
) => {
  const cache = new Map<T, R>();
  return (value: T): R => {
    if (cache.has(value)) {
      return cache.get(value)!;
    }

    const result = formatter(value);
    cache.set(value, result);
    return result;
  };
};
