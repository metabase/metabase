import { useDebouncedValue } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useListUnreferencedGraphNodesQuery } from "metabase-enterprise/api";

import { DependencyListView } from "../../components/DependencyListView";
import type { DependencyFilterOptions } from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

import { AVAILABLE_GROUP_TYPES } from "./constants";

export function UnreferencedDependencyListPage() {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    getSearchQuery(searchValue),
    SEARCH_DEBOUNCE_DURATION,
  );

  const [filterOptions, setFilterOptions] = useState<DependencyFilterOptions>({
    groupTypes: [],
  });
  const groupTypes =
    filterOptions.groupTypes.length > 0
      ? filterOptions.groupTypes
      : AVAILABLE_GROUP_TYPES;

  const {
    data = [],
    isFetching,
    isLoading,
    error,
  } = useListUnreferencedGraphNodesQuery({
    query: searchQuery,
    types: getDependencyTypes(groupTypes),
    card_types: getCardTypes(groupTypes),
  });

  return (
    <DependencyListView
      nodes={data}
      searchValue={searchValue}
      filterOptions={filterOptions}
      availableGroupTypes={AVAILABLE_GROUP_TYPES}
      nothingFoundMessage={t`No unreferenced entities found.`}
      error={error}
      isFetching={isFetching}
      isLoading={isLoading}
      onSearchValueChange={setSearchValue}
      onFilterOptionsChange={setFilterOptions}
    />
  );
}
