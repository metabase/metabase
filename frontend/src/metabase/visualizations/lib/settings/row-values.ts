export const getNumberOr = <TValue, TReplacement>(
  value: TValue,
  replacement: TReplacement,
): number | TReplacement => {
  if (typeof value === "number") {
    return value;
  }

  return replacement;
};
