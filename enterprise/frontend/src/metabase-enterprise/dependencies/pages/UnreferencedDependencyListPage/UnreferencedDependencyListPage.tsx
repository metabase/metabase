import { useDebouncedValue } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useListUnreferencedGraphNodesQuery } from "metabase-enterprise/api";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import { DependencyListView } from "../../components/DependencyListView";
import type { DependencyFilterOptions } from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

const EMPTY_NODES: DependencyNode[] = [];

export const AVAILABLE_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
];

export function UnreferencedDependencyListPage() {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    getSearchQuery(searchValue),
    SEARCH_DEBOUNCE_DURATION,
  );
  const [filterOptions, setFilterOptions] = useState<DependencyFilterOptions>({
    groupTypes: [],
  });
  const [selectedEntry, setSelectedEntry] = useState<DependencyEntry | null>(
    null,
  );

  const groupTypes =
    filterOptions.groupTypes.length > 0
      ? filterOptions.groupTypes
      : AVAILABLE_GROUP_TYPES;

  const {
    data = EMPTY_NODES,
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
      selectedEntry={selectedEntry}
      searchValue={searchValue}
      filterOptions={filterOptions}
      availableGroupTypes={AVAILABLE_GROUP_TYPES}
      nothingFoundMessage={t`No unreferenced entities found.`}
      error={error}
      isFetching={isFetching}
      isLoading={isLoading}
      onSelect={setSelectedEntry}
      onSearchValueChange={setSearchValue}
      onFilterOptionsChange={setFilterOptions}
    />
  );
}
