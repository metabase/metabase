import { match } from "ts-pattern";

import type {
  RemoteSyncChangesArea,
  RemoteSyncChangesTarget,
} from "metabase/plugins";
import type {
  CollectionId,
  RemoteSyncEntity,
  RemoteSyncEntityModel,
  TransformId,
} from "metabase-types/api";

export type RemoteSyncChanges = {
  areas: ReadonlySet<RemoteSyncChangesArea>;
  collectionIds: ReadonlySet<CollectionId>;
  transformIds: ReadonlySet<TransformId>;
};

const TABLE_MODELS: ReadonlySet<RemoteSyncEntityModel> = new Set([
  "tableusersettings",
  "fieldusersettings",
  "segment",
  "measure",
]);

const TRANSFORM_MODELS: ReadonlySet<RemoteSyncEntityModel> = new Set([
  "transform",
  "transformtag",
  "transformtest",
  "pythonlibrary",
]);

const getCollectionIdsWithAncestors = (
  dirty: RemoteSyncEntity[],
): Set<CollectionId> =>
  new Set(
    dirty.flatMap(({ collection }) =>
      collection
        ? [
            collection.id,
            ...collection.effective_ancestors.map((ancestor) => ancestor.id),
          ]
        : [],
    ),
  );

const isInLibraryCollection = ({ collection }: RemoteSyncEntity): boolean =>
  collection != null &&
  [collection, ...collection.effective_ancestors].some(
    ({ type }) => type === "library",
  );

const getEntityAreas = (entity: RemoteSyncEntity): RemoteSyncChangesArea[] => {
  const isInLibrary =
    TABLE_MODELS.has(entity.model) || isInLibraryCollection(entity);

  return [
    ...(isInLibrary ? ["library" as const] : []),
    ...(TRANSFORM_MODELS.has(entity.model) ? ["transforms" as const] : []),
    ...(entity.model === "pythonlibrary" ? ["python-library" as const] : []),
    ...(entity.model === "nativequerysnippet" ? ["snippets" as const] : []),
    ...(entity.model === "action" && entity.parent == null
      ? ["data-actions" as const]
      : []),
    ...(entity.model === "glossary" ? ["glossary" as const] : []),
  ];
};

export const getRemoteSyncChanges = (
  dirty: RemoteSyncEntity[],
): RemoteSyncChanges => ({
  areas: new Set(dirty.flatMap(getEntityAreas)),
  collectionIds: getCollectionIdsWithAncestors(dirty),
  transformIds: new Set(
    dirty
      .filter((entity) => entity.model === "transform")
      .map((entity) => entity.id),
  ),
});

export const hasRemoteSyncChanges = (
  changes: RemoteSyncChanges,
  target: RemoteSyncChangesTarget,
): boolean =>
  match(target)
    .with({ type: "area" }, ({ area }) => changes.areas.has(area))
    .with({ type: "collection" }, ({ id }) => changes.collectionIds.has(id))
    .with({ type: "transform" }, ({ id }) => changes.transformIds.has(id))
    .exhaustive();
