import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getIcon } from "metabase/common/utils/icon";
import type { TreeItem } from "metabase/data-studio/common/types";
import type { CollectionId, CollectionItem } from "metabase-types/api";

const SEARCH_DEBOUNCE_MS = 300;

export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  snippetTree: TreeItem[],
) {
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const isActive = debouncedQuery.trim().length > 0;

  const {
    data: searchResponse,
    isLoading,
    isFetching,
    error,
  } = useSearchQuery(
    isActive && libraryCollectionId != null
      ? {
          q: debouncedQuery,
          collection: libraryCollectionId,
          models: ["table", "metric"],
        }
      : skipToken,
  );

  const tree = useMemo((): TreeItem[] => {
    if (!isActive) {
      return [];
    }

    const sections: TreeItem[] = [];

    if (searchResponse) {
      const dataItems: TreeItem[] = [];
      const metricItems: TreeItem[] = [];

      for (const result of searchResponse.data) {
        const item: TreeItem = {
          id: `${result.model}:${result.id}`,
          name: result.name,
          icon: getIcon({ model: result.model }).name,
          updatedAt: result.last_edited_at ?? result.updated_at,
          model: result.model as TreeItem["model"],
          parentCollectionName: result.collection?.name,
          data: {
            id: result.id,
            model: result.model,
            name: result.name,
            description: result.description,
            archived: result.archived ?? false,
            collection_position: result.collection_position,
            "last-edit-info": result["last-edit-info"],
          } as CollectionItem,
        };

        if (result.model === "table") {
          dataItems.push(item);
        } else if (result.model === "metric") {
          metricItems.push(item);
        }
      }

      if (dataItems.length > 0) {
        sections.push({
          id: "search-section:data",
          name: t`Data`,
          icon: "table",
          model: "collection",
          data: { model: "collection" } as CollectionItem,
          children: dataItems,
        });
      }

      if (metricItems.length > 0) {
        sections.push({
          id: "search-section:metrics",
          name: t`Metrics`,
          icon: "metric",
          model: "collection",
          data: { model: "collection" } as CollectionItem,
          children: metricItems,
        });
      }
    }

    // Client-side filter snippets
    const filteredSnippets = filterSnippetTree(snippetTree, searchQuery);
    sections.push(...filteredSnippets);

    return sections;
  }, [isActive, searchResponse, snippetTree, searchQuery]);

  return {
    tree,
    isActive,
    isLoading: isLoading || isFetching,
    error,
  };
}

function filterSnippetTree(nodes: TreeItem[], query: string): TreeItem[] {
  const lowerQuery = query.toLowerCase();

  return nodes.flatMap((node) => {
    if (node.model === "snippet") {
      return node.name.toLowerCase().includes(lowerQuery) ? [node] : [];
    }

    if (node.children) {
      const filteredChildren = filterSnippetTree(node.children, query);
      if (filteredChildren.length > 0) {
        return [{ ...node, children: filteredChildren }];
      }
    }

    return [];
  });
}
