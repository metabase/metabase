const LIB_UUID_KEY = "lib/uuid";

type CanonicalUuids = Map<string, string>;

const canonicalValues = new WeakMap<object, Record<string, unknown>>();

// Keys are visited in sorted order, so the position of a UUID does not depend
// on the order the keys were inserted in.
function collectLibUuids(value: unknown, canonicalUuids: CanonicalUuids): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectLibUuids(item, canonicalUuids));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }

  Object.entries(value)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, child]) => {
      if (key !== LIB_UUID_KEY || typeof child !== "string") {
        collectLibUuids(child, canonicalUuids);
      } else if (!canonicalUuids.has(child)) {
        canonicalUuids.set(child, `uuid-${canonicalUuids.size}`);
      }
    });
}

function replaceLibUuids(
  value: unknown,
  canonicalUuids: CanonicalUuids,
): unknown {
  if (typeof value === "string") {
    return canonicalUuids.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceLibUuids(item, canonicalUuids));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return replaceLibUuidsInObject(value, canonicalUuids);
}

function replaceLibUuidsInObject(
  value: object,
  canonicalUuids: CanonicalUuids,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      replaceLibUuids(child, canonicalUuids),
    ]),
  );
}

/**
 * A copy of RTK Query args with every Lib clause UUID replaced by its position,
 * for use as an endpoint's `serializeQueryArgs`.
 *
 * Lib generates new UUIDs whenever a query or metric definition is rebuilt, so
 * without this an otherwise unchanged request gets a new cache key and refetches
 * after an unrelated metadata update. A UUID keeps one positional value wherever
 * it appears, including in a reference to the clause that owns it, so two
 * requests that reference different clauses still get different keys.
 *
 * The same args object returns the same copy, which lets RTK Query reuse its own
 * serialization cache.
 */
export function canonicalizeLibUuids(
  queryArgs: object,
): Record<string, unknown> {
  const cached = canonicalValues.get(queryArgs);
  if (cached) {
    return cached;
  }

  const canonicalUuids: CanonicalUuids = new Map();
  collectLibUuids(queryArgs, canonicalUuids);
  const canonicalValue = replaceLibUuidsInObject(queryArgs, canonicalUuids);
  canonicalValues.set(queryArgs, canonicalValue);

  return canonicalValue;
}
