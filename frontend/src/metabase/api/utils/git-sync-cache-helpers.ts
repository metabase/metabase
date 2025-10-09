import { PLUGIN_GIT_SYNC } from "metabase/plugins";
import type { Card, Collection, Dashboard, Document } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { Api } from "../api";

function shouldInvalidateForEntity(
  oldEntity: Card | Dashboard | Document | undefined,
  newEntity: Card | Dashboard | Document,
): boolean {
  const oldSynced = oldEntity?.is_remote_synced ?? false;
  const newSynced = newEntity.is_remote_synced ?? false;

  return oldSynced !== newSynced || newSynced;
}

function shouldInvalidateForCollection(
  oldCollection: Collection | undefined,
  newCollection: Collection | undefined,
): boolean {
  if (!newCollection) {
    return false;
  }

  const oldType = oldCollection?.type;
  const newType = newCollection.type;

  const typeChanged = oldType !== newType;
  const isOrWasRemoteSynced =
    oldType === "remote-synced" || newType === "remote-synced";

  return (typeChanged && isOrWasRemoteSynced) || newType === "remote-synced";
}

function invalidateRemoteSyncTags(dispatch: Dispatch) {
  const tags = PLUGIN_GIT_SYNC.GIT_SYNC_INVALIDATION_TAGS;
  if (tags) {
    dispatch(Api.util.invalidateTags(tags));
  }
}

export async function invalidateGitSyncOnUpdate<
  TEntity extends Card | Dashboard | Document,
>(
  oldEntity: TEntity | undefined,
  dispatch: (action: unknown) => void,
  queryFulfilled: Promise<{ data: TEntity }>,
) {
  try {
    const { data: newEntity } = await queryFulfilled;
    if (shouldInvalidateForEntity(oldEntity, newEntity)) {
      invalidateRemoteSyncTags(dispatch);
    }
  } catch (error) {
    console.warn("Failed to invalidate git sync cache on update:", error);
  }
}

export async function invalidateGitSyncOnCreate<
  TEntity extends Card | Dashboard | Document,
>(
  dispatch: (action: unknown) => void,
  queryFulfilled: Promise<{ data: TEntity }>,
) {
  try {
    const { data: newEntity } = await queryFulfilled;
    if (newEntity.is_remote_synced) {
      invalidateRemoteSyncTags(dispatch);
    }
  } catch (error) {
    console.warn("Failed to invalidate git sync cache on create:", error);
  }
}

export function invalidateGitSyncOnDelete(
  entity: Card | Dashboard | Document | undefined,
  dispatch: (action: unknown) => void,
) {
  if (entity?.is_remote_synced) {
    invalidateRemoteSyncTags(dispatch);
  }
}

export async function invalidateGitSyncOnCollectionUpdate(
  oldCollection: Collection | undefined,
  dispatch: (action: unknown) => void,
  queryFulfilled: Promise<{ data: Collection }>,
) {
  try {
    const { data: newCollection } = await queryFulfilled;
    if (shouldInvalidateForCollection(oldCollection, newCollection)) {
      invalidateRemoteSyncTags(dispatch);
    }
  } catch (error) {
    console.warn(
      "Failed to invalidate git sync cache on collection update:",
      error,
    );
  }
}

export async function invalidateGitSyncOnCollectionCreate(
  dispatch: (action: unknown) => void,
  queryFulfilled: Promise<{ data: Collection }>,
) {
  try {
    const { data: newCollection } = await queryFulfilled;
    if (newCollection.type === "remote-synced") {
      invalidateRemoteSyncTags(dispatch);
    }
  } catch (error) {
    console.warn(
      "Failed to invalidate git sync cache on collection create:",
      error,
    );
  }
}

export function invalidateGitSyncOnCollectionDelete(
  collection: Collection | undefined,
  dispatch: (action: unknown) => void,
) {
  if (collection?.type === "remote-synced") {
    invalidateRemoteSyncTags(dispatch);
  }
}

export function getGitSyncInvalidationTags() {
  return PLUGIN_GIT_SYNC.GIT_SYNC_INVALIDATION_TAGS || [];
}
