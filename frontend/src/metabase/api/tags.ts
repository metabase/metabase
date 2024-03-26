export const API_KEY_TAG = "API_KEY_TAG" as const;
export const DATABASE_TAG = "DATABASE_TAG" as const;
export const FIELD_VALUES_TAG = "FIELD_VALUES_TAG" as const;

export const TAG_TYPES = [API_KEY_TAG, DATABASE_TAG, FIELD_VALUES_TAG];
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
