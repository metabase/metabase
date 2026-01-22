import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { FixedSizeIcon, Flex, Loader, TextInput } from "metabase/ui";

import type { DependencyFilterOptions } from "../../../types";
import { getSearchQuery } from "../../../utils";
import { FilterOptionsPicker } from "../../FilterOptionsPicker";
import type { DependencyListMode } from "../types";
import { getAvailableGroupTypes } from "../utils";

type ListSearchBarProps = {
  mode: DependencyListMode;
  query?: string;
  filters: DependencyFilterOptions;
  hasLoader: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFiltersChange: (filters: DependencyFilterOptions) => void;
};

export const ListSearchBar = memo(function ListSearchBar({
  mode,
  query,
  filters,
  hasLoader,
  onQueryChange,
  onFiltersChange,
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

  const handleFiltersChange = (newFilters: DependencyFilterOptions) => {
    onFiltersChange({ ...filters, ...newFilters });
  };

  return (
    <Flex gap="md" align="center">
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
        filters={filters}
        availableGroupTypes={getAvailableGroupTypes(mode)}
        onFiltersChange={handleFiltersChange}
      />
    </Flex>
  );
});
