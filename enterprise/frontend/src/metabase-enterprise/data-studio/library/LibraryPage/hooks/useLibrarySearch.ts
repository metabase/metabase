import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { TreeItem } from "metabase/data-studio/common/types";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { CollectionId } from "metabase-types/api";

const SEARCH_DEBOUNCE_MS = 300;

export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  snippetTree: TreeItem[],
) {
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const isActive = debouncedQuery.trim().length > 0;
  const getIcon = useGetIcon();

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
        if (result.model !== "table" && result.model !== "metric") {
          continue;
        }

        const item: TreeItem = {
          id: `${result.model}:${result.id}`,
          name: result.name,
          icon: getIcon({ model: result.model }).name,
          updatedAt: result.last_edited_at ?? result.updated_at,
          model: result.model,
          parentCollectionName: result.collection?.name,
          data: {
            id: Number(result.id),
            model: result.model,
            name: result.name,
            description: result.description,
            collection_id: result.collection_id ?? null,
            archived: result.archived ?? false,
            collection_position: result.collection_position,
            "last-edit-info": result["last-edit-info"],
          },
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
          data: {
            model: "collection",
            name: t`Data`,
          },
          children: dataItems,
        });
      }

      if (metricItems.length > 0) {
        sections.push({
          id: "search-section:metrics",
          name: t`Metrics`,
          icon: "metric",
          model: "collection",
          data: {
            model: "collection",
            name: t`Metrics`,
          },
          children: metricItems,
        });
      }
    }

    // Client-side filter snippets
    const filteredSnippets = filterSnippetTree(snippetTree, debouncedQuery);
    sections.push(...filteredSnippets);

    return sections;
  }, [isActive, searchResponse, snippetTree, debouncedQuery, getIcon]);

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
