export type TagType = typeof TAG_TYPES[number];

export const TAG_TYPES = [
  "action",
  "alert",
  "api-key",
  "bookmark",
  "card",
  "cloud-migration",
  "collection",
  "dashboard",
  "database",
  "field",
  "field-values",
  "indexed-entity",
  "model-index",
  "parameter-values",
  "permissions-group",
  "persisted-info",
  "persisted-model",
  "revision",
  "schema",
  "segment",
  "snippet",
  "subscription",
  "table",
  "task",
  "timeline",
  "timeline-event",
  "user",
  "cubedata",
  "company-name",
  "checkpoints",
  "feedback",
  "company",
  "cubes_requests",
] as const;

export const TAG_TYPE_MAPPING = {
  collection: "collection",
  card: "card",
  dashboard: "dashboard",
  database: "database",
  "indexed-entity": "indexed-entity",
  table: "table",
  dataset: "card",
  action: "action",
  segment: "segment",
  metric: "card",
  snippet: "snippet",
  pulse: "subscription",
  cubedata: "cubedata",
  "company-name": "company-name",
  checkpoints: "checkpoints",
  feedback: "feedback",
  company: "company",
  cubes_requests: "cubes_requests",
} as const;
