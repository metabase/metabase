import { useKBar, useRegisterActions } from "kbar";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useSearchListQuery } from "metabase/common/hooks";
import Search from "metabase/entities/search";
import { useDispatch } from "metabase/lib/redux";
import { entityTypeForObject } from "metabase/lib/schema";
import { closeModal } from "metabase/redux/ui";
import type { SearchResult } from "metabase-types/api";

import type { PaletteAction } from "../types";

export const useCommandPaletteSearch = ({
  debouncedQuery,
}: {
  debouncedQuery: string;
}) => {
  const { currentRootActionId } = useKBar(state => state);
  const dispatch = useDispatch();
  const showSearch = currentRootActionId === "search-parent";

  const {
    data: searchResults = [],
    error: searchError,
    isLoading: isSearchLoading,
  } = useSearchListQuery<SearchResult>({
    enabled: !!debouncedQuery,
    query: { q: debouncedQuery, limit: 20 },
    reload: true,
  });

  const searchResultActions = useMemo<PaletteAction[]>(() => {
    if (!debouncedQuery) {
      return [];
    }
    if (isSearchLoading) {
      return [
        {
          id: "search-is-loading",
          name: "Loading...",
          keywords: debouncedQuery,
          section: "search",
          parent: "search-parent",
        },
      ];
    } else if (searchError) {
      return [
        {
          id: "search-error",
          name: t`Could not load search results`,
          section: "search",
          parent: "search-parent",
        },
      ];
    } else if (debouncedQuery) {
      if (searchResults?.length) {
        return searchResults.map(result => {
          const wrappedResult = Search.wrapEntity(result, dispatch);
          const entityName = entityTypeForObject(result);
          return {
            id: `search-result-${entityName}-${result.id}`, //These need to be properly unique if they're going to be children of a parent action
            name: result.name,
            icon: wrappedResult.getIcon().name,
            section: "search",
            parent: "search-parent",
            perform: () => {
              dispatch(closeModal());
              dispatch(push(wrappedResult.getUrl()));
            },
            extra: {
              parentCollection: wrappedResult.getCollection().name,
              isVerified: result.moderated_status === "verified",
              database: result.database_name,
            },
          };
        });
      } else {
        return [
          {
            id: "no-search-results",
            name: t`No results for “${debouncedQuery}”`,
            keywords: debouncedQuery,
            section: "search",
            parent: "search-parent",
            perform: () => {
              dispatch(
                push({
                  pathname: "search",
                  query: {
                    q: debouncedQuery,
                  },
                }),
              );
            },
          },
        ];
      }
    }
    return [];
  }, [dispatch, debouncedQuery, isSearchLoading, searchError, searchResults]);

  useRegisterActions(showSearch ? searchResultActions : [], [
    searchResultActions,
    showSearch,
  ]);
};
