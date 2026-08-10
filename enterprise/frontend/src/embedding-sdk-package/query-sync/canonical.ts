import { createHash } from "node:crypto";

/** Serializes a query with stable object-key ordering. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

/** Returns the source table and stable hash of an authored query. */
export function getQueryFingerprint(query: Record<string, unknown>) {
  const source = query.source;

  if (
    !isRecord(source) ||
    source.type !== "table" ||
    typeof source.id !== "number" ||
    !Number.isInteger(source.id) ||
    source.id <= 0
  ) {
    throw new Error("Synchronized queries must use a valid table source.");
  }

  const tableId = source.id;

  const authoredDsl: Record<string, unknown> = {
    ...query,
    source: { type: "table" },
  };

  delete authoredDsl.savedQuestionSourceId;

  const hash = createHash("sha256")
    .update(canonicalJson(authoredDsl))
    .digest("hex");

  return { tableId, hash: `v1:sha256:${hash}` };
}

/** Serializes a resolved query while normalizing generated Lib UUIDs. */
export function getCanonicalQueryJson(value: unknown): string {
  const canonical = canonicalize(value);
  const generatedIds = new Map<string, number>();

  JSON.stringify(canonical, (key, item) => {
    if (
      key === "lib/uuid" &&
      typeof item === "string" &&
      !generatedIds.has(item)
    ) {
      generatedIds.set(item, generatedIds.size);
    }

    return item;
  });

  return JSON.stringify(canonical, (key, item) => {
    if (key === "lib/uuid") {
      return undefined;
    }

    const generatedId =
      typeof item === "string" ? generatedIds.get(item) : undefined;

    return generatedId === undefined
      ? item
      : `generated-query-id:${generatedId}`;
  });
}

/** Validates a query value and recursively sorts object keys. */
function canonicalize(value: unknown, seen = new Set<object>()): unknown {
  const type = typeof value;

  if (value === null || type === "string" || type === "boolean") {
    return value;
  }

  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Query definitions cannot contain non-finite numbers.");
    }

    return value;
  }

  if (typeof value !== "object") {
    throw new Error(`Query definitions cannot contain ${type} values.`);
  }

  if (seen.has(value)) {
    throw new Error("Query definitions cannot contain circular references.");
  }

  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Query definitions must contain only plain objects.");
    }
  }

  seen.add(value);

  const result = Array.isArray(value)
    ? value.map((item) => canonicalize(item, seen))
    : Object.fromEntries(
        Object.entries(value)
          .sort(([first], [second]) => first.localeCompare(second))
          .map(([key, item]) => [key, canonicalize(item, seen)]),
      );

  seen.delete(value);

  return result;
}

/** Checks whether a value is a non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
