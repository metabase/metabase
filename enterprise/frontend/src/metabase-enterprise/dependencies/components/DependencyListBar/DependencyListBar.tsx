import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Flex, Icon, Loader, TextInput } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../types";

import { FilterOptionsPicker } from "./FilterOptionsPicker";

type DependencyListBarProps = {
  searchValue: string;
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  isFetching: boolean;
  isLoading: boolean;
  onSearchValueChange: (searchValue: string) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function DependencyListBar({
  searchValue,
  filterOptions,
  availableGroupTypes,
  isFetching,
  isLoading,
  onSearchValueChange,
  onFilterOptionsChange,
}: DependencyListBarProps) {
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
        rightSection={
          isFetching && !isLoading ? <Loader size="sm" /> : undefined
        }
        onChange={handleSearchChange}
      />
      <FilterOptionsPicker
        filterOptions={filterOptions}
        availableGroupTypes={availableGroupTypes}
        onFilterOptionsChange={onFilterOptionsChange}
      />
    </Flex>
  );
}
