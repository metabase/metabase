import { useDebouncedValue } from "@mantine/hooks";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { SearchResults } from "metabase/common/components/EntityPicker/components/SearchTab/SearchResults";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";

const MAX_RECENTS = 10;

export const RecentsItemList = () => {
  const { isHiddenItem } = useOmniPickerContext();

  const {
    data: results,
    error,
    isLoading,
  } = useListRecentsQuery();

  const filteredResults = results?.filter((item) => !isHiddenItem?.(item))?.slice(0, MAX_RECENTS) || [];

  return (
    <SearchResults
      searchResults={filteredResults}
      isLoading={isLoading}
      error={error}
    />
  );
};
