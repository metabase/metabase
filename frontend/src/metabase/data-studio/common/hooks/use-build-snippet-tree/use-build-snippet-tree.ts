import { useMemo } from "react";

import { useListCollectionsQuery, useListSnippetsQuery } from "metabase/api";
import type { TreeItem } from "metabase/data-studio/common/types";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";

import { buildActiveSnippetTree, buildArchivedSnippetTree } from "./utils";

export const useBuildSnippetTree = ({ archived = false } = {}): {
  isLoading: boolean;
  tree: TreeItem[];
  error?: unknown;
} => {
  const {
    data: snippets,
    isLoading: loadingSnippets,
    isFetching: fetchingSnippets,
    error,
  } = useListSnippetsQuery({ archived }, { refetchOnMountOrArgChange: true });
  const {
    data: snippetCollections,
    isLoading: loadingCollections,
    isFetching: fetchingCollections,
  } = useListCollectionsQuery(
    {
      namespace: "snippets",
      archived,
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
            !isRemoteSyncReadOnly,
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
  ]);
};
