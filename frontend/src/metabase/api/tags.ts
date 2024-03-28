export const TAG_TYPES = [
  "api-key",
  "database",
  "database-metadata",
  "database-id-fields",
  "table",
  "table-metadata",
  "table-foreign-keys",
  "field",
  "field-values",
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
