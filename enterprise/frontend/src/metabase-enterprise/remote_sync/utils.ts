import type { RemoteSyncDirtyAreas } from "metabase/plugins";
import type {
  Collection,
  CollectionId,
  RemoteSyncEntity,
} from "metabase-types/api";

import { TABLE_MODELS, TRANSFORM_MODELS } from "./constants";

const getAncestorIds = (collection: Collection): CollectionId[] =>
  (collection.location ?? "")
    .split("/")
    .filter((id) => id.length > 0)
    .map(Number);

export const getDirtyCollectionIds = (
  dirty: RemoteSyncEntity[],
  collections: Collection[],
): Set<CollectionId> => {
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const ownIds = dirty.flatMap((entity) =>
    entity.model === "collection" ? [entity.id] : (entity.collection_id ?? []),
  );
  return new Set(
    ownIds.flatMap((id) => {
      const collection = collectionById.get(id);
      return collection ? [id, ...getAncestorIds(collection)] : [id];
    }),
  );
};

const getLibraryCollectionIds = (
  collections: Collection[],
): Set<CollectionId> => {
  const library = collections.find(
    (collection) => collection.type === "library",
  );
  if (!library) {
    return new Set();
  }
  return new Set(
    collections
      .filter(
        (collection) =>
          collection.id === library.id ||
          getAncestorIds(collection).includes(Number(library.id)),
      )
      .map((collection) => collection.id),
  );
};

export const getDirtyAreas = (
  dirty: RemoteSyncEntity[],
  collections: Collection[],
): RemoteSyncDirtyAreas => {
  const libraryIds = getLibraryCollectionIds(collections);
  const isInLibrary = (entity: RemoteSyncEntity) =>
    TABLE_MODELS.has(entity.model) ||
    (entity.collection_id != null && libraryIds.has(entity.collection_id)) ||
    (entity.model === "collection" && libraryIds.has(entity.id));

  return {
    library: dirty.some(isInLibrary),
    transforms: dirty.some((entity) => TRANSFORM_MODELS.has(entity.model)),
    snippets: dirty.some((entity) => entity.model === "nativequerysnippet"),
    dataActions: dirty.some(
      (entity) => entity.model === "action" && entity.card_id == null,
    ),
    glossary: dirty.some((entity) => entity.model === "glossary"),
  };
};
