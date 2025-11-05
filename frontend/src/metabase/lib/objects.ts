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

export function isSerializable(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  const type = typeof value;

  if (
    type === "string" ||
    type === "number" ||
    type === "boolean" ||
    type === "bigint"
  ) {
    return true;
  }

  if (type === "function" || type === "symbol") {
    return false;
  }

  if (value instanceof Date) {
    return false;
  }

  if (type === "object") {
    const proto = Object.getPrototypeOf(value);

    if (
      proto === Object.prototype ||
      proto === Array.prototype ||
      proto === null
    ) {
      if (Array.isArray(value)) {
        return value.every(isSerializable);
      }

      return Object.values(value as Record<string, unknown>).every(
        isSerializable,
      );
    }

    return false;
  }

  return false;
}
