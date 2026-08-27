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
