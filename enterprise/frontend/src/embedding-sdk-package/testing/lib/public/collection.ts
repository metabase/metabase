import type {
  MetabaseCollection,
  MetabaseCollectionItem,
} from "embedding-sdk-bundle/types/collection";

export function createMockCollection(
  opts?: Partial<MetabaseCollection>,
): MetabaseCollection {
  return {
    id: 1,
    name: "Collection",
    entity_id: "mockCollectionEntityId",
    description: null,
    ...opts,
  };
}

export function createMockCollectionItem(
  opts?: Partial<MetabaseCollectionItem>,
): MetabaseCollectionItem {
  return {
    id: 1,
    entity_id: "mockQuestionEntityId",
    model: "card",
    name: "Question",
    description: null,
    ...opts,
  };
}
