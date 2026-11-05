import { isPlainObject } from "metabase-types/guards";

/**
 * Recursively freezes the plain objects and arrays in `value` and returns it, so a test fails
 * when the code under test mutates its input. Class instances and built-ins like `Date` stay as they are.
 */
export function deepFreeze<T>(value: T): T {
  freezeCollections(value, new WeakSet());
  return value;
}

function freezeCollections(value: unknown, visited: WeakSet<object>) {
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);
  Object.freeze(value);
  const children: unknown[] = Object.values(value);
  children.forEach((child) => freezeCollections(child, visited));
}
