/**
 * Filter out empty arrays, strings, objects, null and undefined.
 * This keeps the embed settings readable in snippets.
 */
export function filterEmptySettings<T extends Record<string, any>>(
  settings: T,
): T {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if (typeof value === "object" && value !== null) {
        return Object.keys(value).length > 0;
      }

      return value !== undefined && value !== null && value !== "";
    }),
  ) as T;
}
