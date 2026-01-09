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

import { DependencyList } from "../../components/DependencyList";
import type { DependencyFilterOptions } from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

const EMPTY_NODES: DependencyNode[] = [];

export const AVAILABLE_GROUP_TYPES: DependencyGroupType[] = [
  "model",
  "metric",
  "segment",
  "snippet",
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
    data: nodes = EMPTY_NODES,
    isFetching,
    isLoading,
    error,
  } = useListUnreferencedGraphNodesQuery({
    query: searchQuery,
    types: getDependencyTypes(groupTypes),
    card_types: getCardTypes(groupTypes),
  });

  return (
    <DependencyList
      nodes={nodes}
      selectedEntry={selectedEntry}
      searchValue={searchValue}
      filterOptions={filterOptions}
      availableGroupTypes={AVAILABLE_GROUP_TYPES}
      notFoundMessage={t`No unreferenced entities found`}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      onSelect={setSelectedEntry}
      onSearchValueChange={setSearchValue}
      onFilterOptionsChange={setFilterOptions}
    />
  );
}
