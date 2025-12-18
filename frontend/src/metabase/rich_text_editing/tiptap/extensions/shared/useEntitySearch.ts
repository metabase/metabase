import { useMemo } from "react";

import {
  useListMentionsQuery,
  useListRecentsQuery,
  useSearchQuery,
} from "metabase/api";
import type { MenuItem } from "metabase/documents/components/Editor/shared/MenuComponents";
import type {
  MentionableUser,
  RecentItem,
  SearchModel,
  SearchRequest,
  SearchResult,
} from "metabase-types/api";

import type { SuggestionModel } from "../shared/types";

import {
  LINK_SEARCH_LIMIT,
  LINK_SEARCH_MODELS,
  USER_SEARCH_LIMIT,
} from "./constants";
import {
  buildRecentsMenuItems,
  buildSearchMenuItems,
  buildUserMenuItems,
  filterRecents,
} from "./suggestionUtils";

export type EntitySearchOptions = Omit<SearchRequest, "q" | "models" | "limit">;

interface UseEntitySearchOptions {
  query: string;
  onSelectRecent: (item: RecentItem) => void;
  onSelectSearchResult: (item: SearchResult) => void;
  onSelectUser: (item: MentionableUser) => void;
  enabled?: boolean;
  shouldFetchRecents?: boolean;
  searchModels?: SuggestionModel[];
  searchOptions?: EntitySearchOptions;
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
  onSelectUser,
  enabled = true,
  shouldFetchRecents = true,
  searchModels = LINK_SEARCH_MODELS,
  searchOptions = {},
}: UseEntitySearchOptions): UseEntitySearchResult {
  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, {
      refetchOnMountOrArgChange: 10, // only refetch if the cache is more than 10 seconds stale
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
      models: searchModels.filter(
        (model): model is SearchModel => model !== "user",
      ),
      limit: LINK_SEARCH_LIMIT,
      ...searchOptions,
    },
    {
      skip: !enabled || shouldFetchRecents,
    },
  );

  const { data: usersResponse, isLoading: isUsersLoading } =
    useListMentionsQuery(undefined, {
      skip: !searchModels.includes("user"),
    });

  const users = useMemo(() => {
    return (usersResponse?.data ?? [])
      .filter((user) => {
        return user.common_name.toLowerCase().includes(query.toLowerCase());
      })
      .slice(0, USER_SEARCH_LIMIT);
  }, [usersResponse, query]);

  const searchResults = useMemo(
    () => searchResponse?.data ?? [],
    [searchResponse],
  );

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [];

    if (!shouldFetchRecents) {
      if (!isUsersLoading) {
        items.push(...buildUserMenuItems(users, onSelectUser));
      }

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
    shouldFetchRecents,
    searchResults,
    users,
    isSearchLoading,
    isUsersLoading,
    filteredRecents,
    isRecentsLoading,
    onSelectRecent,
    onSelectSearchResult,
    onSelectUser,
  ]);

  return {
    menuItems,
    isLoading: shouldFetchRecents ? isRecentsLoading : isSearchLoading,
    searchResults,
  };
}
