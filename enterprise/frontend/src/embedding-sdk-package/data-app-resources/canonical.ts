/** Serializes a definition with stable object-key ordering. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

/** Validates a definition value and recursively sorts object keys. */
function canonicalize(value: unknown, seen = new Set<object>()): unknown {
  const type = typeof value;

  if (value === null || type === "string" || type === "boolean") {
    return value;
  }

  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Definitions cannot contain non-finite numbers.");
    }

    return value;
  }

  if (typeof value !== "object") {
    throw new Error(`Definitions cannot contain ${type} values.`);
  }

  if (seen.has(value)) {
    throw new Error("Definitions cannot contain circular references.");
  }

  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Definitions must contain only plain objects.");
    }
  }

  seen.add(value);

  const result = Array.isArray(value)
    ? value.map((item) => canonicalize(item, seen))
    : Object.fromEntries(
        Object.entries(value)
          .sort(([first], [second]) => {
            if (first < second) {
              return -1;
            }
            if (first > second) {
              return 1;
            }
            return 0;
          })
          .map(([key, item]) => [key, canonicalize(item, seen)]),
      );

  seen.delete(value);

  return result;
}
