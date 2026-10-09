import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { TreeItem } from "metabase/data-studio/common/types";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { CollectionId, IconName, SearchResult } from "metabase-types/api";

const SEARCH_DEBOUNCE_MS = 300;

export type LibrarySearchModel = "table" | "metric" | "dashboard";

type SearchSection = {
  id: string;
  name: string;
  icon: IconName;
};

const getSearchSections = (): Record<LibrarySearchModel, SearchSection> => ({
  table: { id: "search-section:data", name: t`Data`, icon: "table" },
  metric: { id: "search-section:metrics", name: t`Metrics`, icon: "metric" },
  dashboard: {
    id: "search-section:dashboards",
    name: t`Dashboards`,
    icon: "dashboard",
  },
});

export function useLibrarySearch(
  searchQuery: string,
  libraryCollectionId: CollectionId | undefined,
  models: LibrarySearchModel[],
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
          models,
          context: "library",
        }
      : skipToken,
  );

  const tree = useMemo((): TreeItem[] => {
    if (!isActive || !searchResponse) {
      return [];
    }

    const sections = getSearchSections();
    return models.flatMap((model): TreeItem[] => {
      const children = searchResponse.data
        .filter((result) => result.model === model)
        .map((result) => createSearchResultItem(result, model, getIcon));
      if (children.length === 0) {
        return [];
      }
      const { id, name, icon } = sections[model];
      return [
        {
          id,
          name,
          icon,
          model: "collection",
          data: { model: "collection", name },
          children,
        },
      ];
    });
  }, [isActive, searchResponse, models, getIcon]);

  return {
    tree,
    isActive,
    isLoading: isLoading || isFetching,
    error,
  };
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
    },
  };
}
