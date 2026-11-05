export const isObject = (
  value: unknown,
): value is Record<string | number | symbol, unknown> => {
  return typeof value === "object" && value !== null;
};

/**
 * Whether the value is an object literal or `Object.create(null)`, not an array, a class instance or a built-in like `Date`.
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (!isObject(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const isFunction = (
  value: unknown,
): value is (...args: unknown[]) => unknown => {
  return typeof value === "function";
};

export const isMap = (value: unknown): value is Map<unknown, unknown> => {
  return Object.prototype.toString.call(value) === "[object Map]";
};

export const isSet = (value: unknown): value is Set<unknown> => {
  return Object.prototype.toString.call(value) === "[object Set]";
};

export const isDate = (value: unknown): value is Date => {
  return Object.prototype.toString.call(value) === "[object Date]";
};
