import type {
  BaseEntityId,
  Collection,
  CollectionEssentials,
  CollectionItem,
} from "metabase-types/api";

import { createMockEntityId } from "./entity-id";

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
  namespace: null,
  entity_id: createMockEntityId(),
  ...opts,
});

export const createMockCollectionItem = (
  opts?: Partial<CollectionItem>,
): CollectionItem => ({
  id: 1,
  entity_id: createMockEntityId(),
  model: "card",
  name: "Question",
  description: null,
  collection_position: null,
  collection_preview: true,
  collection_id: null,
  fully_parameterized: true,
  type: null,
  archived: false,
  ...opts,
});

export const createMockCollectionItemFromCollection = (
  opts?: Partial<Collection>,
): CollectionItem =>
  createMockCollectionItem({
    ...opts,
    id: opts?.id as number,
    entity_id: opts?.entity_id as BaseEntityId,
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

export const createMockLibraryCollection = (
  opts?: Partial<Collection>,
): Collection =>
  createMockCollection({
    id: 1,
    name: "Library",
    type: "library",
    ...opts,
  });

export const createMockTransformsCollection = (
  opts?: Partial<Collection>,
): Collection =>
  createMockCollection({
    id: 100,
    name: "Transforms",
    namespace: "transforms",
    ...opts,
  });
