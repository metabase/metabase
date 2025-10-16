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

import { getDependencyEntry, getSelectOptions } from "./utils";

type SearchInputProps = {
  onEntryChange: (entry: DependencyEntry) => void;
};

const MODELS: SearchModel[] = [
  "card",
  "dataset",
  "metric",
  "table",
  "transform",
];

const EMPTY_RESULTS: SearchResult[] = [];

export function SearchInput({ onEntryChange }: SearchInputProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    searchValue.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const { data: response, isLoading } = useSearchQuery(
    {
      q: searchQuery,
      models: MODELS,
    },
    {
      skip: searchQuery.length === 0,
    },
  );

  const results = response?.data ?? EMPTY_RESULTS;
  const options = useMemo(() => getSelectOptions(results), [results]);

  const handleChange = (value: string | null) => {
    const option = options.find((option) => option.value === value);
    if (option != null) {
      onEntryChange(getDependencyEntry(option.result));
    }
  };

  return (
    <Select
      data={options}
      searchValue={searchValue}
      placeholder={t`Find something…`}
      nothingFoundMessage={t`Didn't find any results`}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={isLoading ? <Loader size="sm" /> : undefined}
      w="20rem"
      searchable
      onChange={handleChange}
      onSearchChange={setSearchValue}
    />
  );
}
