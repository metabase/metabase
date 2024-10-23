import type {
  Collection,
  CollectionEssentials,
  CollectionItem,
} from "metabase-types/api";

export const createMockCollection = (
  opts?: Partial<Collection>,
): Collection => ({
  id: 1,
  name: "Collection",
  description: null,
  location: "/",
  can_write: true,
  can_restore: false,
  can_delete: false,
  archived: false,
  is_personal: false,
  authority_level: null,
  entity_id: "an_entity_id",
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
  collection_id: null,
  fully_parameterized: true,
  type: null,
  getIcon: () => ({ name: "question" }),
  getUrl: () => "/question/1",
  archived: false,
  ...opts,
});

export const createMockCollectionItemFromCollection = (
  opts?: Partial<Collection>,
): CollectionItem =>
  createMockCollectionItem({
    ...opts,
    id: opts?.id as number,
    model: "collection",
    type: undefined,
    location: opts?.location || "/",
  });

export const createMockCollectionEssential = (
  opts?: Partial<CollectionEssentials>,
): CollectionEssentials => ({
  id: opts?.id || 1,
  name: `Collection ${opts?.id || 1}`,
  ...opts,
});
