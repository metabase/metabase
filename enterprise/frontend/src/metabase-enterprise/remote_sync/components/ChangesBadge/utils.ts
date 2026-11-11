import { match } from "ts-pattern";

import type {
  RemoteSyncChangesArea,
  RemoteSyncChangesTarget,
} from "metabase/plugins";
import type {
  CollectionId,
  RemoteSyncDirtyItem,
  TransformId,
} from "metabase-types/api";

import {
  getItemAreas,
  getItemCollections,
  getItemTransformId,
} from "../../utils";

export type RemoteSyncChanges = {
  areas: ReadonlySet<RemoteSyncChangesArea>;
  collectionIds: ReadonlySet<CollectionId>;
  transformIds: ReadonlySet<TransformId>;
};

function getItemCollectionIds(item: RemoteSyncDirtyItem): CollectionId[] {
  return getItemCollections(item).map(({ id }) => id);
}

export function getRemoteSyncChanges(
  dirty: RemoteSyncDirtyItem[],
): RemoteSyncChanges {
  return {
    areas: new Set(dirty.flatMap(getItemAreas)),
    collectionIds: new Set(dirty.flatMap(getItemCollectionIds)),
    transformIds: new Set(
      dirty.flatMap((item) => getItemTransformId(item) ?? []),
    ),
  };
}

export function hasRemoteSyncChanges(
  changes: RemoteSyncChanges,
  target: RemoteSyncChangesTarget,
): boolean {
  return match(target)
    .with({ type: "area" }, ({ area }) => changes.areas.has(area))
    .with({ type: "collection" }, ({ id }) => changes.collectionIds.has(id))
    .with({ type: "transform" }, ({ id }) => changes.transformIds.has(id))
    .exhaustive();
}
