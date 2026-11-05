import type { DeepPartial } from "metabase-types/utils/types";

/**
 * Deep-merges `source` into `target` without changing either, like icepick's `merge`.
 *
 * Plain objects merge recursively. Arrays and every other value from `source` replace the target value.
 * Unchanged subtrees keep their references, and `target` itself comes back when nothing changes,
 * including when `source` is `null` or `undefined`.
 */
export function mergeDeep<T extends object>(
  target: T,
  source: DeepPartial<T> | null | undefined,
): T {
  if (source == null) {
    return target;
  }
  // `source` is a deep partial of `T`, so every key it sets keeps the type `T` gives it.
  return mergeObjects(target, source) as T;
}

function mergeObjects(target: object, source: object): object {
  let result = target;
  for (const key of Object.keys(source)) {
    const targetValue = readProperty(target, key);
    const mergedValue = mergeValues(targetValue, readProperty(source, key));
    if (mergedValue !== targetValue) {
      if (result === target) {
        result = shallowCopy(target);
      }
      Reflect.set(result, key, mergedValue);
    }
  }
  return result;
}

function mergeValues(targetValue: unknown, sourceValue: unknown): unknown {
  const canMerge =
    sourceValue !== targetValue &&
    isPlainRecord(sourceValue) &&
    (Array.isArray(targetValue) || isPlainRecord(targetValue));
  return canMerge ? mergeObjects(targetValue, sourceValue) : sourceValue;
}

function shallowCopy(value: object): object {
  if (Array.isArray(value)) {
    return value.slice();
  }
  const copy: object =
    Object.getPrototypeOf(value) === null ? Object.create(null) : {};
  return Object.assign(copy, value);
}

// We box primitives with `Object()` so a truthy string or number reads like `value[key]` does.
function readProperty(container: unknown, key: PropertyKey): unknown {
  return Reflect.get(Object(container), key);
}

// We keep this check local: the embed.js script build cannot import metabase-types.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
