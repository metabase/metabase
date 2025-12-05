import { useMemo } from "react";

import {
  skipToken,
  useListCollectionItemsQuery,
  useListCollectionsQuery,
  useListSnippetsQuery,
} from "metabase/api";
import { getIcon } from "metabase/lib/icon";
import type { Collection } from "metabase-types/api";

import { buildSnippetTree } from "./ModelingSidebar/ModelingSidebarView/SnippetsSection/utils";
import type { TreeItem } from "./types";

export const useBuildTreeForCollection = (
  collection?: Collection,
): {
  isLoading: boolean;
  tree: TreeItem[];
} => {
  const { data: items, isLoading } = useListCollectionItemsQuery(
    collection ? { id: collection.id } : skipToken,
  );

  return useMemo(() => {
    if (isLoading || !items || !collection) {
      return {
        isLoading,
        tree: [],
      };
    }
    return {
      isLoading,
      tree: [
        {
          name: collection.name,
          id: collection.id,
          icon: getIcon({ ...collection, model: "collection" }).name,
          data: { ...collection, model: "collection" },
          children: items.data.map((item) => ({
            name: item.name,
            updatedAt: item["last-edit-info"]?.timestamp,
            icon: getIcon({ model: item.model }).name,
            data: item,
            id: item.id,
          })),
        },
      ],
    };
  }, [collection, items, isLoading]);
};

export const useBuildSnippetTree = (): {
  isLoading: boolean;
  tree: TreeItem[];
} => {
  const { data: snippets, isLoading: loadingSnippets } = useListSnippetsQuery();
  const { data: snippetCollections, isLoading: loadingCollections } =
    useListCollectionsQuery({
      namespace: "snippets",
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
      };
    }

    return {
      isLoading: false,
      tree: buildSnippetTree(snippetCollections, snippets),
    };
  }, [loadingSnippets, loadingCollections, snippets, snippetCollections]);
};
