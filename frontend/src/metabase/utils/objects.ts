export const getObjectEntries = <K extends string, V>(
  obj: Record<K, V>,
): [K, V][] => {
  const entries: [K, V][] = [];

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      entries.push([key, obj[key]]);
    }
  }

  return entries;
};

export const getObjectKeys = <T extends object>(
  obj: T,
): Array<Extract<keyof T, string>> => {
  const keys: Array<Extract<keyof T, string>> = [];

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      keys.push(key);
    }
  }

  return keys;
};

export const getObjectValues = <V>(obj: Record<string, V>): V[] => {
  const values: V[] = [];

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      values.push(obj[key]);
    }
  }

  return values;
};

export const objectFromEntries = <K extends string, V>(
  entries: readonly (readonly [K, V])[],
): Record<K, V> => {
  const object: Record<string, V> = {};

  for (const [key, value] of entries) {
    Object.defineProperty(object, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return object;
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

      return Object.values(value).every(isSerializable);
    }

    return false;
  }

  return false;
}
