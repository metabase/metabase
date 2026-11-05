import { pickBy } from "es-toolkit";

export const isNotNull = <T>(value: T | null | undefined): value is T => {
  return value != null;
};

export const asNotNull = <T>(value: T | null | undefined): T => {
  if (isNotNull(value)) {
    return value;
  }
  throw new TypeError("value is null or undefined");
};

export const isNotFalsy = <T>(
  value: T | null | undefined | false | "",
): value is T => {
  return value != null && value !== false && value !== "";
};

export const isNumber = (value: unknown): value is number => {
  return typeof value === "number";
};

export const checkNotNull = <T>(value: T | null | undefined): T => {
  if (value != null) {
    return value;
  } else {
    throw new TypeError();
  }
};

export const isNullOrUndefined = (value: any): value is null | undefined =>
  value === undefined || value === null;

export const removeNullAndUndefinedValues = <T extends Record<string, unknown>>(
  obj: T,
) => pickBy(obj, (val) => !isNullOrUndefined(val));

export const checkNumber = (value: any) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError(`value ${value} is not a non-NaN number`);
  }
  return value;
};
