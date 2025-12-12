import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Flex } from "metabase/ui";
import { useListBrokenGraphNodesQuery } from "metabase-enterprise/api";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import { DependencyListPanel } from "../../components/DependencyListPanel";
import { DependencyListView } from "../../components/DependencyListView";
import type { DependencyFilterOptions } from "../../types";
import {
  getCardTypes,
  getDependencyTypes,
  getSearchQuery,
  isSameNode,
} from "../../utils";

const EMPTY_NODES: DependencyNode[] = [];

export const AVAILABLE_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "transform",
];

export function BrokenDependencyListPage() {
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
  } = useListBrokenGraphNodesQuery({
    query: searchQuery,
    types: getDependencyTypes(groupTypes),
    card_types: getCardTypes(groupTypes),
  });

  const selectedNode = useMemo(() => {
    return selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : null;
  }, [nodes, selectedEntry]);

  return (
    <Flex h="100%">
      <DependencyListView
        nodes={nodes}
        searchValue={searchValue}
        filterOptions={filterOptions}
        availableGroupTypes={AVAILABLE_GROUP_TYPES}
        nothingFoundMessage={t`No broken entities found.`}
        error={error}
        isFetching={isFetching}
        isLoading={isLoading}
        withErrorsColumn
        withDependentsCountColumn
        onSelect={setSelectedEntry}
        onSearchValueChange={setSearchValue}
        onFilterOptionsChange={setFilterOptions}
      />
      {selectedNode != null && (
        <DependencyListPanel
          node={selectedNode}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </Flex>
  );
}
