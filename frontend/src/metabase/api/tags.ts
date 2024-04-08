export const TAG_TYPES = [
  "action",
  "api-key",
  "card",
  "collection",
  "dashboard",
  "database",
  "field",
  "field-values",
  "indexed-entity",
  "metric",
  "schema",
  "snippet",
  "segment",
  "table",
  "timeline",
  "timeline-event",
  "user",
] as const;

export const MODEL_TO_TAG_TYPE = {
  collection: "collection",
  card: "card",
  dashboard: "dashboard",
  database: "database",
  "indexed-entity": "indexed-entity",
  table: "table",
  dataset: "card",
  action: "action",
  segment: "segment",
  metric: "metric",
  snippet: "snippet",
} as const;

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
