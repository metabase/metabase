import { createHash } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown, seen = new Set<object>()): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Query definitions cannot contain non-finite numbers.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error("Query definitions cannot contain circular references.");
    }
    seen.add(value);
    const result = value.map((item) => canonicalize(item, seen));
    seen.delete(value);
    return result;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new Error("Query definitions cannot contain circular references.");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Query definitions must contain only plain objects.");
    }
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) =>
          first < second ? -1 : first > second ? 1 : 0,
        )
        .map(([key, item]) => [key, canonicalize(item, seen)]),
    );
    seen.delete(value);
    return result;
  }

  throw new Error(`Query definitions cannot contain ${typeof value} values.`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function queryFingerprint(query: Record<string, unknown>) {
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

  return {
    tableId,
    hash: `v1:sha256:${createHash("sha256")
      .update(canonicalJson(authoredDsl))
      .digest("hex")}`,
  };
}

export function stripGeneratedQueryIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripGeneratedQueryIds);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "lib/uuid")
        .map(([key, item]) => [key, stripGeneratedQueryIds(item)]),
    );
  }
  return value;
}
