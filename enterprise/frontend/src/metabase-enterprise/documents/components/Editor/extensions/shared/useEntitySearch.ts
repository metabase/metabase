import { useMemo } from "react";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import type { MenuItem } from "../../shared/MenuComponents";

import { LINK_SEARCH_LIMIT, LINK_SEARCH_MODELS } from "./constants";
import {
  buildRecentsMenuItems,
  buildSearchMenuItems,
  filterRecents,
} from "./suggestionUtils";

interface UseEntitySearchOptions {
  query: string;
  onSelectRecent: (item: RecentItem) => void;
  onSelectSearchResult: (item: SearchResult) => void;
  enabled?: boolean;
  searchModels?: SearchModel[];
}

interface UseEntitySearchResult {
  menuItems: MenuItem[];
  isLoading: boolean;
  searchResults: SearchResult[];
}

export function useEntitySearch({
  query,
  onSelectRecent,
  onSelectSearchResult,
  enabled = true,
  searchModels = LINK_SEARCH_MODELS,
}: UseEntitySearchOptions): UseEntitySearchResult {
  const shouldFetchRecents = enabled && query.length === 0;

  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, {
      refetchOnMountOrArgChange: true,
      skip: !shouldFetchRecents,
    });

  const filteredRecents = useMemo(
    () =>
      shouldFetchRecents
        ? recents
            .filter((recent) => filterRecents(recent, searchModels))
            .slice(0, LINK_SEARCH_LIMIT)
        : [],
    [recents, shouldFetchRecents, searchModels],
  );

  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery(
    {
      q: query,
      models: searchModels,
      limit: LINK_SEARCH_LIMIT,
    },
    {
      skip: !enabled || !query || query.length === 0,
    },
  );

  const searchResults = useMemo(
    () => searchResponse?.data ?? [],
    [searchResponse],
  );

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [];

    if (query.length > 0) {
      if (!isSearchLoading) {
        items.push(
          ...buildSearchMenuItems(searchResults, onSelectSearchResult),
        );
      }
    } else {
      if (!isRecentsLoading && filteredRecents.length > 0) {
        items.push(...buildRecentsMenuItems(filteredRecents, onSelectRecent));
      }
    }

    return items;
  }, [
    query,
    searchResults,
    isSearchLoading,
    filteredRecents,
    isRecentsLoading,
    onSelectRecent,
    onSelectSearchResult,
  ]);

  const isLoading =
    (shouldFetchRecents && isRecentsLoading) ||
    (query.length > 0 && isSearchLoading);

  return {
    menuItems,
    isLoading,
    searchResults,
  };
}
