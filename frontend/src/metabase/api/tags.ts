const LIST_ID = "LIST" as const;

function getListTag<T extends string>(tagType: T) {
  return { type: tagType, id: LIST_ID } as const;
}

export function getListItemTags<TagType extends string>(
  tagType: TagType,
  ids: string[] | number[] = [],
) {
  const listTag = getListTag(tagType);
  return [listTag, ...ids.map(id => ({ type: tagType, id }))];
}

export const API_KEY_TAG = "ApiKey" as const;
export const API_KEY_LIST_TAG = getListTag(API_KEY_TAG);

export const FIELD_VALUES_TAG = "FieldValues" as const;
export const FIELD_VALUES_LIST_TAG = getListTag(FIELD_VALUES_TAG);

export const tagTypes = [API_KEY_TAG, FIELD_VALUES_TAG];
export type TagTypes = typeof tagTypes[number];
