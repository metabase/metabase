export const API_KEY_TAG = "API_KEY_TAG" as const;
export const DATABASE_TAG = "DATABASE_TAG" as const;
export const FIELD_VALUES_TAG = "FIELD_VALUES_TAG" as const;

export const TAG_TYPES = [API_KEY_TAG, DATABASE_TAG, FIELD_VALUES_TAG];
export type TagType = typeof TAG_TYPES[number];

export function catchAllTag(type: TagType) {
  return { type };
}

export function listTag(type: TagType) {
  return { type, id: "LIST" };
}

export function itemTag(type: TagType, id: string | number) {
  return { type, id };
}

export function listWithItemTags(type: TagType, ids: (string | number)[] = []) {
  return [listTag(type), ...ids.map(id => itemTag(type, id))];
}
