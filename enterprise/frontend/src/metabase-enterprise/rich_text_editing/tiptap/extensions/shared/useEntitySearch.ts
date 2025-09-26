import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { useListMentionsQuery } from "metabase-enterprise/api";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import type { SuggestionModel } from "metabase-enterprise/documents/components/Editor/types";
import type {
  MentionableUser,
  RecentItem,
  SearchModel,
  SearchResult,
} from "metabase-types/api";

import {
  LINK_SEARCH_LIMIT,
  LINK_SEARCH_MODELS,
  USER_SEARCH_LIMIT,
} from "./constants";
import { buildSearchMenuItems, buildUserMenuItems } from "./suggestionUtils";

interface UseEntitySearchOptions {
  query: string;
  onSelectRecent: (item: RecentItem) => void;
  onSelectSearchResult: (item: SearchResult) => void;
  onSelectUser: (item: MentionableUser) => void;
  enabled?: boolean;
  searchModels?: SuggestionModel[];
}

interface UseEntitySearchResult {
  menuItems: MenuItem[];
  isLoading: boolean;
  searchResults: SearchResult[];
}

export function useEntitySearch({
  query,
  // onSelectRecent,
  onSelectSearchResult,
  onSelectUser,
  enabled = true,
  searchModels = LINK_SEARCH_MODELS,
}: UseEntitySearchOptions): UseEntitySearchResult {
  // TODO: add back
  // const shouldFetchRecents = enabled && query.length === 0;
  // const { data: recents = [], isLoading: isRecentsLoading } =
  //   useListRecentsQuery(undefined, {
  //     refetchOnMountOrArgChange: 10, // only refetch if the cache is more than 10 seconds stale
  //     skip: !shouldFetchRecents,
  //   });
  // const filteredRecents = useMemo(
  //   () =>
  //     shouldFetchRecents
  //       ? recents
  //           .filter((recent) => filterRecents(recent, searchModels))
  //           .slice(0, LINK_SEARCH_LIMIT)
  //       : [],
  //   [recents, shouldFetchRecents, searchModels],
  // );

  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery(
    {
      q: query,
      models: searchModels.filter(
        (model): model is SearchModel => model !== "user",
      ),
      limit: LINK_SEARCH_LIMIT,
    },
    {
      skip: !enabled, // TODO  || !query || query.length === 0,
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

    if (!isUsersLoading) {
      items.push(...buildUserMenuItems(users, onSelectUser));
    }

    if (!isSearchLoading) {
      items.push(...buildSearchMenuItems(searchResults, onSelectSearchResult));
    }

    // TODO: need to change if recents option has been explicitly accepted
    // } else {
    //   if (!isRecentsLoading && filteredRecents.length > 0) {
    //     items.push(...buildRecentsMenuItems(filteredRecents, onSelectRecent));
    //   }
    // }

    return items;
  }, [
    // query,
    searchResults,
    users,
    isSearchLoading,
    isUsersLoading,
    // filteredRecents,
    // isRecentsLoading,
    // onSelectRecent,
    onSelectSearchResult,
    onSelectUser,
  ]);

  const isLoading =
    // (shouldFetchRecents && isRecentsLoading) ||
    query.length > 0 && isSearchLoading;

  return {
    menuItems,
    isLoading,
    searchResults,
  };
}
