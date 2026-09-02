export const isObject = (
  value: unknown,
): value is Record<string | number | symbol, unknown> => {
  return typeof value === "object" && value !== null;
};

export const isFunction = (
  value: unknown,
): value is (...args: unknown[]) => unknown => {
  return typeof value === "function";
};

// Tag checks see through proxies and across realms, instanceof doesn't.
const getTag = (value: unknown): string =>
  Object.prototype.toString.call(value);

export const isMap = (value: unknown): value is Map<unknown, unknown> =>
  getTag(value) === "[object Map]";

export const isSet = (value: unknown): value is Set<unknown> =>
  getTag(value) === "[object Set]";

export const isDate = (value: unknown): value is Date =>
  getTag(value) === "[object Date]";
