export const TAG_TYPES = [
  "api-key",
  "card",
  "database",
  "field",
  "field-values",
  "schema",
  "segment",
  "table",
] as const;

export type TagType = typeof TAG_TYPES[number];

export function tag(type: TagType) {
  return { type };
}

export function listTag(type: TagType) {
  return { type, id: "LIST" };
}

export function idTag(type: TagType, id: string | number) {
  return { type, id };
}

export function invalidateTags<T>(error: unknown, tags: T[]) {
  return !error ? tags : [];
}
