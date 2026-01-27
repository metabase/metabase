import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { FixedSizeIcon, Group, Loader, TextInput } from "metabase/ui";

import type { DependencyFilterOptions } from "../../../types";
import { getSearchQuery } from "../../../utils";
import { FilterOptionsPicker } from "../../FilterOptionsPicker";
import type { DependencyListMode } from "../types";
import { getAvailableGroupTypes } from "../utils";

type ListSearchBarProps = {
  mode: DependencyListMode;
  query?: string;
  filterOptions: DependencyFilterOptions;
  hasLoader: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export const ListSearchBar = memo(function ListSearchBar({
  mode,
  query,
  filterOptions,
  hasLoader,
  onQueryChange,
  onFilterOptionsChange,
}: ListSearchBarProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleSearchDebounce(newSearchValue);
  };

  const handleSearchDebounce = useDebouncedCallback(
    (newSearchValue: string) => {
      const newQuery = getSearchQuery(newSearchValue);
      onQueryChange(newQuery);
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleFilterOptionsChange = (
    newFilterOptions: DependencyFilterOptions,
  ) => {
    onFilterOptionsChange(newFilterOptions);
  };

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <TextInput
        value={searchValue}
        placeholder={t`Search…`}
        flex={1}
        leftSection={<FixedSizeIcon name="search" />}
        rightSection={hasLoader ? <Loader size="sm" /> : undefined}
        data-testid="dependency-list-search-input"
        onChange={handleSearchChange}
      />
      <FilterOptionsPicker
        filterOptions={filterOptions}
        availableGroupTypes={getAvailableGroupTypes(mode)}
        onFilterOptionsChange={handleFilterOptionsChange}
      />
    </Group>
  );
});
