import { NULL_DISPLAY_VALUE } from "../constants";

export function formatNullable<T>(value: T | null | undefined) {
  return value ?? NULL_DISPLAY_VALUE;
}
