/**
 * Coerce a guest-controlled argument to a string once, up front, so a
 * validation check and the native DOM call operate on the same value.
 */
export function coerceToString(value: unknown): string {
  return String(value);
}
