import { useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import type { RemoteSyncDirtyState } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";
import type { CollectionId } from "metabase-types/api";

import { getIsRemoteSyncVisible } from "./selectors";
import { getDirtyAreas, getDirtyCollectionIds } from "./utils";

export const useIsRemoteSyncVisible = (): boolean =>
  useSelector(getIsRemoteSyncVisible);

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
