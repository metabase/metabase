import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { FixedSizeIcon, Loader, Select } from "metabase/ui";
import type { DependencyEntry, SearchModel } from "metabase-types/api";

import { SearchModelPicker } from "./SearchModelPicker";
import { getSelectOptions } from "./utils";

type EntrySearchInputProps = {
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

export function EntrySearchInput({
  isFetching: isGraphFetching,
  onEntryChange,
}: EntrySearchInputProps) {
  const [searchModels, setSearchModels] = useState(SEARCH_MODELS);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    searchValue.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );
  const isSearchEnabled = searchQuery.length > 0;

  const { data: searchResponse, isFetching: isSearchFetching } = useSearchQuery(
    {
      q: searchQuery,
      models: searchModels,
    },
    {
      skip: !isSearchEnabled,
    },
  );

  const searchOptions = useMemo(
    () => (isSearchEnabled ? getSelectOptions(searchResponse?.data ?? []) : []),
    [searchResponse, isSearchEnabled],
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
      nothingFoundMessage={
        isSearchEnabled ? `Didn't find any results` : undefined
      }
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
