import { useMemo } from "react";

import { useListActionsQuery, useListCollectionsQuery } from "metabase/api";
import type { TreeItem } from "metabase/data-studio/common/types";

import { buildActiveActionTree, buildArchivedActionTree } from "./utils";

type ActionTreeOptions = {
  archived?: boolean;
  canCreateActions?: boolean;
};

export function useBuildActionTree({
  archived = false,
  canCreateActions = false,
}: ActionTreeOptions = {}): {
  isLoading: boolean;
  tree: TreeItem[];
  error?: unknown;
} {
  const {
    data: actions,
    isLoading: isLoadingActions,
    error: actionsError,
  } = useListActionsQuery({ type: "query", archived });
  const {
    data: collections,
    isLoading: isLoadingCollections,
    error: collectionsError,
  } = useListCollectionsQuery({ namespace: "data-actions", archived });

  return useMemo(() => {
    const error = actionsError ?? collectionsError;
    if (isLoadingActions || isLoadingCollections || !actions || !collections) {
      return { isLoading: true, tree: [], error };
    }

    return {
      isLoading: false,
      error,
      tree: archived
        ? buildArchivedActionTree(collections, actions)
        : buildActiveActionTree(collections, actions, canCreateActions),
    };
  }, [
    actions,
    actionsError,
    archived,
    canCreateActions,
    collections,
    collectionsError,
    isLoadingActions,
    isLoadingCollections,
  ]);
}
