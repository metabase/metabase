import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { FixedSizeIcon, Flex, Loader, TextInput } from "metabase/ui";
import type { DependencyFilterOptions } from "metabase-types/api";

import { getSearchQuery } from "../../../utils";
import { FilterOptionsPicker } from "../../FilterOptionsPicker";
import type { DependencyListMode } from "../types";
import { getAvailableCardTypes, getAvailableTypes } from "../utils";

type ListSearchBarProps = {
  mode: DependencyListMode;
  filters: DependencyFilterOptions;
  hasLoader: boolean;
  onFiltersChange: (filters: DependencyFilterOptions) => void;
};

export const ListSearchBar = memo(function ListSearchBar({
  mode,
  filters,
  hasLoader,
  onFiltersChange,
}: ListSearchBarProps) {
  const [searchValue, setSearchValue] = useState(filters.query ?? "");

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleSearchDebounce(newSearchValue);
  };

  const handleSearchDebounce = useDebouncedCallback(
    (newSearchValue: string) => {
      const newQuery = getSearchQuery(newSearchValue);
      onFiltersChange({ ...filters, query: newQuery });
    },
    SEARCH_DEBOUNCE_DURATION,
  );

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
        availableTypes={getAvailableTypes(mode)}
        availableCardTypes={getAvailableCardTypes(mode)}
        onFiltersChange={onFiltersChange}
      />
    </Flex>
  );
});
