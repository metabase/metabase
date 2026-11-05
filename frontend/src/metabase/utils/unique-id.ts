let lastId = 0;

/**
 * Returns an id that is unique within the page session, optionally prefixed.
 */
export function uniqueId(prefix?: string): string {
  lastId++;
  return prefix ? `${prefix}${lastId}` : String(lastId);
}
