import { useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { getWorktreeRootCollectionItems } from "./utils";

/**
 * The top-level items of a picker confined to one branch: that branch's
 * top-level collections. Everything deeper comes from the standard collection
 * item list, whose children are scoped to their collection's branch already.
 */
export const useWorktreeRootItems = (worktreeId: RemoteSyncWorktreeId) => {
  const { data: collections, isLoading } = useListCollectionsQuery({
    "worktree-id": worktreeId,
  });

  const items = useMemo(
    () => getWorktreeRootCollectionItems(collections),
    [collections],
  );

  return { items, isLoading };
};
