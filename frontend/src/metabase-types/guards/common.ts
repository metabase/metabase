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

export const isMap = (value: unknown): value is Map<unknown, unknown> => {
  return Object.prototype.toString.call(value) === "[object Map]";
};

export const isSet = (value: unknown): value is Set<unknown> => {
  return Object.prototype.toString.call(value) === "[object Set]";
};

export const isDate = (value: unknown): value is Date => {
  return Object.prototype.toString.call(value) === "[object Date]";
};
