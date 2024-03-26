export const TAG_TYPES = ["ApiKey", "Database", "FieldValues"] as const;

export type TagType = typeof TAG_TYPES[number];

export function tag(type: TagType) {
  return { type };
}

export function tagWithList(type: TagType) {
  return { type, id: "LIST" };
}

export function tagWithId(type: TagType, id: string | number) {
  return { type, id };
}
