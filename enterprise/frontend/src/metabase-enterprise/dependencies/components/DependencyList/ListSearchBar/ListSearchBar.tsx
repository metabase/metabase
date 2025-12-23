import { type ChangeEvent, memo } from "react";
import { t } from "ttag";

import { Flex, Icon, Loader, TextInput } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../../types";

import { FilterOptionsPicker } from "./FilterOptionsPicker";

type ListSearchBarProps = {
  searchValue: string;
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  hasLoader: boolean;
  onSearchValueChange: (searchValue: string) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export const ListSearchBar = memo(function ListSearchBar({
  searchValue,
  filterOptions,
  availableGroupTypes,
  hasLoader,
  onSearchValueChange,
  onFilterOptionsChange,
}: ListSearchBarProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchValueChange(event.target.value);
  };

  return (
    <Flex gap="md" align="center">
      <TextInput
        value={searchValue}
        placeholder={t`Search…`}
        flex={1}
        leftSection={<Icon name="search" />}
        rightSection={hasLoader ? <Loader size="sm" /> : undefined}
        data-testid="dependency-list-search-input"
        onChange={handleSearchChange}
      />
      <FilterOptionsPicker
        filterOptions={filterOptions}
        availableGroupTypes={availableGroupTypes}
        onFilterOptionsChange={onFilterOptionsChange}
      />
    </Flex>
  );
});
