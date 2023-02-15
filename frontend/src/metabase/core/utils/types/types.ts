export const isNotNull = <T>(value: T | null | undefined): value is T => {
  return value != null;
};

export const checkNotNull = <T>(value: T | null | undefined): T => {
  if (value != null) {
    return value;
  } else {
    throw new TypeError();
  }
};
