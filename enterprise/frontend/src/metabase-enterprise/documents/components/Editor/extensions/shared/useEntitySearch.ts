import { useMemo } from "react";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import type { MenuItem } from "../../shared/MenuComponents";

import { LINK_SEARCH_LIMIT, LINK_SEARCH_MODELS } from "./constants";
import {
  buildRecentsMenuItems,
  buildSearchMenuItems,
  isRecentQuestion,
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
  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, {
      refetchOnMountOrArgChange: true,
      skip: !enabled,
    });

  const filteredRecents = useMemo(
    () => recents.filter(isRecentQuestion).slice(0, LINK_SEARCH_LIMIT),
    [recents],
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
    () => (searchResponse?.data as SearchResult[]) ?? [],
    [searchResponse],
  );

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [];

    if (query.length > 0) {
      if (!isSearchLoading && searchResults.length > 0) {
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
    (isRecentsLoading && query.length === 0) ||
    (isSearchLoading && query.length > 0);

  return {
    menuItems,
    isLoading,
    searchResults,
  };
}
