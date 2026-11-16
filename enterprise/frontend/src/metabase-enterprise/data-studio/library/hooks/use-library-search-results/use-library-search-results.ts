import { useMemo } from "react";

import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { TreeItem } from "metabase/data-studio/common/types";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { SearchResult } from "metabase-types/api";

const SEARCH_DEBOUNCE_MS = 300;
const NO_ITEMS: TreeItem[] = [];

export type LibrarySearchModel = "table" | "metric";

type LibrarySearchResults = {
  items: TreeItem[];
  isActive: boolean;
  isLoading: boolean;
  error: unknown;
};

/**
 * Debounced server-side search for `models` in every collection, leaving out
 * the tables that are not published. `items` is empty until the query has text.
 */
export function useLibrarySearchResults(
  searchQuery: string,
  models: LibrarySearchModel[],
): LibrarySearchResults {
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const isActive = debouncedQuery.trim().length > 0;
  const getIcon = useGetIcon();

  const {
    data: searchResponse,
    isLoading,
    isFetching,
    error,
  } = useSearchQuery(
    isActive
      ? {
          q: debouncedQuery,
          models,
          context: "library",
        }
      : skipToken,
  );

  const items = useMemo((): TreeItem[] => {
    if (!isActive || !searchResponse) {
      return NO_ITEMS;
    }
    return searchResponse.data.flatMap((result) => {
      const model = models.find((searchModel) => searchModel === result.model);
      return model && isInCollection(result)
        ? [createSearchResultItem(result, model, getIcon)]
        : [];
    });
  }, [isActive, searchResponse, models, getIcon]);

  return {
    items,
    isActive,
    isLoading: isLoading || isFetching,
    error,
  };
}

function isInCollection(result: SearchResult): boolean {
  return result.model !== "table" || result.collection?.id != null;
}

function createSearchResultItem(
  result: SearchResult,
  model: LibrarySearchModel,
  getIcon: ReturnType<typeof useGetIcon>,
): TreeItem {
  return {
    id: `${model}:${result.id}`,
    name: result.name,
    icon: getIcon({ model }).name,
    updatedAt: result.last_edited_at ?? result.updated_at,
    model,
    parentCollectionName: result.collection?.name,
    data: {
      id: Number(result.id),
      model,
      name: result.name,
      description: result.description,
      collection_id: result.collection_id ?? null,
      archived: result.archived ?? false,
      collection_position: result.collection_position,
      "last-edit-info": result["last-edit-info"],
      can_write: result.can_write ?? false,
    },
  };
}
