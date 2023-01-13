import { Collection, CollectionItem } from "metabase-types/api";

export const createMockCollection = (
  opts?: Partial<Collection>,
): Collection => ({
  id: 1,
  name: "Collection",
  description: null,
  location: "/",
  can_write: false,
  archived: false,
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
  fully_parametrized: true,
  getIcon: () => ({ name: "card" }),
  getUrl: () => "/question/1",
  ...opts,
});
