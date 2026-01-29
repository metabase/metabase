import { useMemo } from "react";

import { useListCollectionsQuery, useListSnippetsQuery } from "metabase/api";
import type { TreeItem } from "metabase-enterprise/data-studio/common/types";

import { buildActiveSnippetTree, buildArchivedSnippetTree } from "./utils";

export const useBuildSnippetTree = ({ archived = false } = {}): {
  isLoading: boolean;
  tree: TreeItem[];
  error?: unknown;
} => {
  const {
    data: snippets,
    isLoading: loadingSnippets,
    error,
  } = useListSnippetsQuery({ archived });
  const { data: snippetCollections, isLoading: loadingCollections } =
    useListCollectionsQuery({
      namespace: "snippets",
      archived,
    });

  return useMemo(() => {
    if (
      loadingSnippets ||
      loadingCollections ||
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
        : buildActiveSnippetTree(snippetCollections, snippets),
    };
  }, [
    loadingSnippets,
    loadingCollections,
    snippets,
    snippetCollections,
    error,
    archived,
  ]);
};
