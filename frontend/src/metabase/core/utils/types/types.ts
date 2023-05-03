// Having `false` type here makes it easier to use `isNotNull` with array filter:
// [item, condition && anotherItem].filter(isNotNull)
export const isNotNull = <T>(
  value: T | false | null | undefined,
): value is T => {
  return value != null;
};

export const checkNotNull = <T>(value: T | null | undefined): T => {
  if (value != null) {
    return value;
  } else {
    throw new TypeError();
  }
};
