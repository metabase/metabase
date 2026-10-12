import { useMemo } from "react";

import {
  skipToken,
  useListActionsQuery,
  useListCollectionsQuery,
} from "metabase/api";
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
  const {
    data: activeCollections,
    isLoading: isLoadingActiveCollections,
    error: activeCollectionsError,
  } = useListCollectionsQuery(
    archived ? { namespace: "data-actions", archived: false } : skipToken,
  );

  return useMemo(() => {
    const error = actionsError ?? collectionsError ?? activeCollectionsError;
    const isLoading =
      isLoadingActions ||
      isLoadingCollections ||
      isLoadingActiveCollections ||
      !actions ||
      !collections ||
      (archived && !activeCollections);
    if (isLoading) {
      return { isLoading: true, tree: [], error };
    }

    return {
      isLoading: false,
      error,
      tree: archived
        ? buildArchivedActionTree(collections, actions, activeCollections ?? [])
        : buildActiveActionTree(collections, actions, canCreateActions),
    };
  }, [
    actions,
    actionsError,
    activeCollections,
    activeCollectionsError,
    archived,
    canCreateActions,
    collections,
    collectionsError,
    isLoadingActions,
    isLoadingActiveCollections,
    isLoadingCollections,
  ]);
}
