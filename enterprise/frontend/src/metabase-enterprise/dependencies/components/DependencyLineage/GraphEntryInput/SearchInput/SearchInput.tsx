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
import { getDependencyEntry, getSelectOptions } from "./utils";

type SearchInputProps = {
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

export function SearchInput({ onEntryChange }: SearchInputProps) {
  const [searchModels, setSearchModels] = useState(SEARCH_MODELS);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    searchValue.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const { data: response, isLoading } = useSearchQuery(
    {
      q: searchQuery,
      models: searchModels,
    },
    {
      skip: searchQuery.length === 0,
    },
  );

  const searchResults = response?.data ?? EMPTY_SEARCH_RESULTS;
  const searchOptions = useMemo(
    () => getSelectOptions(searchResults),
    [searchResults],
  );

  const handleChange = (value: string | null) => {
    const option = searchOptions.find((option) => option.value === value);
    if (option != null) {
      onEntryChange(getDependencyEntry(option.result));
    }
  };

  return (
    <Select
      data={searchOptions}
      searchValue={searchValue}
      placeholder={t`Find something…`}
      nothingFoundMessage={t`Didn't find any results`}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={
        isLoading ? (
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
      onChange={handleChange}
      onSearchChange={setSearchValue}
    />
  );
}
