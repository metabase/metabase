import { useDebouncedValue } from "@mantine/hooks";

import { useSearchQuery } from "metabase/api";
import { SearchResults } from "metabase/common/components/EntityPicker/components/SearchTab/SearchResults";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";


export const SearchResultsItemList = () => {
  const { models, searchQuery, isHiddenItem, searchScope } = useOmniPickerContext();
  const [debouncedQuery] = useDebouncedValue(searchQuery, 500);

  console.log({ searchScope }); // 🤔 why isn't this updating?

  const {
    data: results,
    error,
    isLoading,
  } = useSearchQuery({
    q: debouncedQuery,
    collection: searchScope || undefined,
    models: models,
  }, { skip: !debouncedQuery });

  const filteredResults = results?.data.filter((item) => !isHiddenItem?.(item)) || [];

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
