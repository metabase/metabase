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

export const objectFromEntries = <K extends string, V>(
  entries: readonly (readonly [K, V])[],
): Record<K, V> => {
  return Object.fromEntries(entries) as Record<K, V>;
};

// `sortObject` copies objects for deterministic serialization.
// Objects that have equal keys and values don't necessarily serialize to the
// same string. JSON.stringify prints properties in inserted order. This function
// sorts keys before adding them to the duplicated object to ensure consistent
// serialization.
export function sortObject(obj: any | any[]): any | any[] {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  const sortedKeyValues = Object.entries(obj).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB),
  );
  const o: Record<string, any> = {};

  for (const [k, v] of sortedKeyValues) {
    o[k] = sortObject(v);
  }

  return o;
}

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
