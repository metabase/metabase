export type TagType = typeof TAG_TYPES[number];
export type ModelType = typeof MODEL_TYPES[number];

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

export const MODEL_TYPES = [
  "collection",
  "card",
  "dashboard",
  "database",
  "indexed-entity",
  "table",
  "dataset",
  "action",
  "segment",
  "metric",
  "snippet",
] as const;

export const MODEL_TO_TAG_TYPE: Record<ModelType, TagType> = {
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
