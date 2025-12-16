import { useDebouncedValue } from "@mantine/hooks";
import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";

import { SearchResults } from "./SearchResults";

export const SearchResultsItemList = () => {
  const { models, searchQuery, isHiddenItem, searchScope } =
    useOmniPickerContext();
  const [debouncedQuery] = useDebouncedValue(searchQuery, 500);

  const { searchCollection, searchModels } = useMemo(() => {
    if (searchScope === "databases") {
      // if we're searching the databases scope, only search for tables
      return {
        searchCollection: undefined,
        searchModels: "table" as const,
      };
    }
    return {
      searchCollection: searchScope || undefined,
      searchModels: models,
    };
  }, [searchScope, models]);

  const {
    data: results,
    error,
    isLoading,
  } = useSearchQuery(
    {
      q: debouncedQuery,
      collection: searchCollection,
      models: searchModels,
    },
    { skip: !debouncedQuery },
  );

  const filteredResults =
    results?.data.filter((item) => !isHiddenItem?.(item)) || [];

  if (!debouncedQuery) {
    return null;
  }

  return (
    <SearchResults
      searchResults={filteredResults}
      isLoading={isLoading}
      error={error}
    />
  );
};
