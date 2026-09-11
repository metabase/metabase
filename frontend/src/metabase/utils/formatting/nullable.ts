import { getNullDisplayValue } from "../constants";

export function formatNullable<T>(value: T | null | undefined) {
  return value ?? getNullDisplayValue();
}
