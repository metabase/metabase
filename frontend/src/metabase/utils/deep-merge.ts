import type { DeepPartial } from "metabase-types/utils/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mergeRecords(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  let result = target;
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    const nextValue =
      isPlainObject(sourceValue) && isPlainObject(targetValue)
        ? mergeRecords(targetValue, sourceValue)
        : sourceValue;
    if (nextValue !== targetValue || !(key in target)) {
      if (result === target) {
        result = { ...target };
      }
      result[key] = nextValue;
    }
  }
  return result;
}

/**
 * Recursively merges `source` into `target` without mutating either.
 *
 * - Plain objects are merged key by key.
 * - Arrays, class instances and primitives from `source` replace the value in
 *   `target`.
 * - Unchanged subtrees keep their identity, and `target` itself is returned
 *   when `source` changes nothing.
 * - A `null` or `undefined` `source`, or a `target` that is not a plain
 *   object, returns `target` as is.
 */
export function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T> | null | undefined,
): T {
  if (source == null || !isPlainObject(target) || !isPlainObject(source)) {
    return target;
  }
  // `mergeRecords` only replaces values that `source` provides, and `source`
  // is a `DeepPartial<T>`, so the result still has the shape of `T`.
  return mergeRecords(target, source) as T;
}
