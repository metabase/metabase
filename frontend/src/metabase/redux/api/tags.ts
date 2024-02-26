export const LIST_ID = "LIST" as const;

export function getListTag<T extends string>(tagType: T) {
  return { type: tagType, id: LIST_ID } as const;
}

export function providesList<
  Results extends { id: string | number }[],
  TagType extends string,
>(resultsWithIds: Results | undefined, tagType: TagType) {
  const listTag = getListTag(tagType);
  return resultsWithIds
    ? [listTag, ...resultsWithIds.map(({ id }) => ({ type: tagType, id }))]
    : [listTag];
}

export const API_KEY_TAG = "ApiKey" as const;
export const API_KEY_LIST_TAG = getListTag(API_KEY_TAG);

export const MODEL_INDEXES_TAG = "ModelIndexes" as const;

export const tagTypes = [API_KEY_TAG, MODEL_INDEXES_TAG];
export type TagTypes = typeof tagTypes[number];
