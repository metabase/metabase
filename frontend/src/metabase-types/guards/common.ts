export const isObject = (
  value: unknown,
): value is Record<string | number | symbol, unknown> => {
  return typeof value === "object" && value !== null;
};
