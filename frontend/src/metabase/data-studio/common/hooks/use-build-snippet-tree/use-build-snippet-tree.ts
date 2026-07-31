import { useMemo } from "react";

import { useListCollectionsQuery, useListSnippetsQuery } from "metabase/api";
import type { TreeItem } from "metabase/data-studio/common/types";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { buildActiveSnippetTree, buildArchivedSnippetTree } from "./utils";

export const useBuildSnippetTree = ({
  archived = false,
  worktreeId,
}: { archived?: boolean; worktreeId?: RemoteSyncWorktreeId } = {}): {
  isLoading: boolean;
  tree: TreeItem[];
  error?: unknown;
} => {
  const {
    data: snippets,
    isLoading: loadingSnippets,
    isFetching: fetchingSnippets,
    error,
  } = useListSnippetsQuery(
    { archived, "worktree-id": worktreeId },
    { refetchOnMountOrArgChange: true },
  );
  const {
    data: snippetCollections,
    isLoading: loadingCollections,
    isFetching: fetchingCollections,
  } = useListCollectionsQuery(
    {
      namespace: "snippets",
      archived,
      "worktree-id": worktreeId,
    },
    { refetchOnMountOrArgChange: true },
  );
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  return useMemo(() => {
    if (
      loadingSnippets ||
      fetchingSnippets ||
      loadingCollections ||
      fetchingCollections ||
      !snippets ||
      !snippetCollections
    ) {
      return {
        isLoading: true,
        tree: [],
        error,
      };
    }

    return {
      isLoading: false,
      error,
      tree: archived
        ? buildArchivedSnippetTree(snippetCollections, snippets)
        : buildActiveSnippetTree(
            snippetCollections,
            snippets,
            // A worktree is an admin's working copy of its branch, so read-only
            // sync only gates snippet creation in the main app.
            worktreeId != null || !isRemoteSyncReadOnly,
            worktreeId,
          ),
    };
  }, [
    loadingSnippets,
    fetchingSnippets,
    loadingCollections,
    fetchingCollections,
    snippets,
    snippetCollections,
    error,
    archived,
    isRemoteSyncReadOnly,
    worktreeId,
  ]);
};
