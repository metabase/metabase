import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { FixedSizeIcon, Loader, Select } from "metabase/ui";
import type {
  DependencyEntry,
  SearchModel,
  SearchResult,
} from "metabase-types/api";

import { SearchModelPicker } from "./SearchModelPicker";
import { getSelectOptions } from "./utils";

type SearchInputProps = {
  isFetching: boolean;
  onEntryChange: (entry: DependencyEntry) => void;
};

const SEARCH_MODELS: SearchModel[] = [
  "card",
  "dataset",
  "metric",
  "table",
  "transform",
];

const EMPTY_SEARCH_RESULTS: SearchResult[] = [];

export function SearchInput({
  isFetching: isGraphFetching,
  onEntryChange,
}: SearchInputProps) {
  const [searchModels, setSearchModels] = useState(SEARCH_MODELS);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    searchValue.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );
  const isEnabled = searchQuery.length > 0;

  const { data: response, isFetching: isSearchFetching } = useSearchQuery(
    {
      q: searchQuery,
      models: searchModels,
    },
    {
      skip: !isEnabled,
    },
  );

  const searchResults =
    response != null && isEnabled ? response.data : EMPTY_SEARCH_RESULTS;
  const searchOptions = useMemo(
    () => getSelectOptions(searchResults),
    [searchResults],
  );

  const handleChange = (value: string | null) => {
    const option = searchOptions.find((option) => option.value === value);
    if (option != null) {
      onEntryChange(option.entry);
    }
  };

  return (
    <Select
      value={null}
      data={searchOptions}
      searchValue={searchValue}
      placeholder={t`Find something…`}
      nothingFoundMessage={isEnabled ? `Didn't find any results` : undefined}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={
        isSearchFetching || isGraphFetching ? (
          <Loader size="sm" />
        ) : (
          <SearchModelPicker
            searchModels={searchModels}
            onSearchModelsChange={setSearchModels}
          />
        )
      }
      w="20rem"
      searchable
      autoFocus
      onChange={handleChange}
      onSearchChange={setSearchValue}
    />
  );
}
