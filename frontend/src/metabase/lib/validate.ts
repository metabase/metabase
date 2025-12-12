// we need this to allow 0 as a valid form value
export const isEmpty = (value: unknown): value is null | undefined | "" =>
  value == null || value === "" || value === undefined;
