import { sortObject } from "metabase-lib/v1/utils";

export const getObjectEntries = <K extends string, V>(
  obj: Record<K, V>,
): [K, V][] => {
  return Object.entries(obj) as [K, V][];
};

export const getObjectKeys = <K extends string>(
  obj: Record<K, unknown>,
): K[] => {
  return Object.keys(obj) as K[];
};

export const getObjectValues = <V>(obj: Record<string, V>): V[] => {
  return Object.values(obj) as V[];
};

// Stringify with sorted keys to ensure stable orders.
export const stableStringify = <T>(obj: T): string =>
  JSON.stringify(sortObject(obj));
