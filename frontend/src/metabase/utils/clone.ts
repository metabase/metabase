/**
 * Implements `structuredClone` in browsers that don't support it.
 *
 * TODO: remove this when Cypress and Jest support native `structuredClone`.
 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
