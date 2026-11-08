import { useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import { getUserIsAdmin } from "metabase/current-user";
import type { RemoteSyncDirtyState } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";
import type { CollectionId } from "metabase-types/api";

import { getDirtyAreas, getDirtyCollectionIds } from "./utils";

export const useIsRemoteSyncVisible = (): boolean => {
  const isAdmin = useSelector(getUserIsAdmin);
  const isEnabled = useSetting("remote-sync-enabled");
  const syncType = useSetting("remote-sync-type");
  const branch = useSetting("remote-sync-branch");
  return Boolean(isAdmin && isEnabled && branch && syncType === "read-write");
};

export const useRemoteSyncDirtyState = (): RemoteSyncDirtyState => {
  const isVisible = useIsRemoteSyncVisible();
  const { data: changes } = useGetRemoteSyncChangesQuery(undefined, {
    skip: !isVisible,
  });
  const { data: collections = [] } = useListCollectionsQuery(
    { archived: false },
    { skip: !isVisible },
  );

  return useMemo(() => {
    const dirty = changes?.dirty ?? [];
    const dirtyCollectionIds = getDirtyCollectionIds(dirty, collections);
    return {
      dirty,
      areas: getDirtyAreas(dirty, collections),
      isCollectionDirty: (collectionId: CollectionId | undefined) =>
        collectionId != null && dirtyCollectionIds.has(collectionId),
    };
  }, [changes, collections]);
};
