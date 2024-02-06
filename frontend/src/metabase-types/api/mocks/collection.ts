import type { Collection, CollectionItem } from "metabase-types/api";

export const createMockCollection = (
  opts?: Partial<Collection>,
): Collection => ({
  id: 1,
  name: "Collection",
  description: null,
  location: "/",
  can_write: true,
  archived: false,
  is_personal: false,
  authority_level: null,
  ...opts,
});

export const createMockCollectionItem = (
  opts?: Partial<CollectionItem>,
): CollectionItem => ({
  id: 1,
  model: "card",
  name: "Question",
  description: null,
  collection_position: null,
  collection_preview: true,
  fully_parameterized: true,
  getIcon: () => ({ name: "question" }),
  getUrl: () => "/question/1",
  ...opts,
});
