export const getObjectEntries = <K extends string, V>(
  obj: Record<K, V>,
): [K, V][] => {
  // Unjustified type cast. FIXME
  return Object.entries(obj) as [K, V][];
};

export const getObjectKeys = <K extends string>(
  obj: Partial<Record<K, unknown>>,
): K[] => {
  // Unjustified type cast. FIXME
  return Object.keys(obj) as K[];
};

export const getObjectValues = <V>(obj: Record<string, V>): V[] => {
  return Object.values(obj);
};

export const objectFromEntries = <K extends string, V>(
  entries: readonly (readonly [K, V])[],
): Record<K, V> => {
  // Unjustified type cast. FIXME
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

      // Unjustified type cast. FIXME
      return Object.values(value as Record<string, unknown>).every(
        isSerializable,
      );
    }

    return false;
  }

  return false;
}

/**
 * Returns true for null and undefined, for arrays, strings and `arguments`
 * with no items, and for any other value without own enumerable keys.
 * Matches underscore's `isEmpty`: a Map or a Set counts as empty, whatever its
 * size, and so do numbers and booleans.
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (Array.isArray(value) || typeof value === "string") {
    return value.length === 0;
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return true;
  }
  return Object.keys(value).length === 0;
}
