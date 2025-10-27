import { useMemo } from "react";

import { skipToken, useSearchQuery } from "metabase/api";
import type { CardId, SearchResult, TableId } from "metabase-types/api";

import { buildTreeFromSearchResults } from "../utils";

/**
 * Fetch items from the search API and renders them as a TreeNode so we can use the same
 * data structure for the tree and the search results and render them in a consistent way.
 */
export function useSearch(query: string) {
  const { data, isLoading } = useSearchQuery(
    query === ""
      ? skipToken
      : {
          q: query,
          models: ["table", "dataset"],
        },
  );

  const tree = useMemo(
    () =>
      buildTreeFromSearchResults(
        data?.data as
          | (SearchResult<TableId, "table"> | SearchResult<CardId, "dataset">)[]
          | undefined,
      ),
    [data],
  );

  return {
    isLoading,
    tree,
  };
}
