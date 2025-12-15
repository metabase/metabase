import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useGetDependencyGraphStatusQuery,
  useListBrokenGraphNodesQuery,
} from "metabase-enterprise/api";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import { DependencyList } from "../../components/DependencyList";
import { DependencyListBar } from "../../components/DependencyListBar";
import { DependencyListEmptyState } from "../../components/DependencyListEmptyState";
import { DependencyListHeader } from "../../components/DependencyListHeader";
import { DependencyListPanel } from "../../components/DependencyListPanel";
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
  "segment",
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
    data: status,
    isLoading: isLoadingStatus,
    isFetching: isFetchingStatus,
    error: statusError,
  } = useGetDependencyGraphStatusQuery();

  const {
    data: nodes = EMPTY_NODES,
    isFetching: isFetchingList,
    isLoading: isLoadingList,
    error: listError,
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

  const isLoading = isLoadingStatus || isLoadingList;
  const isFetching = isFetchingStatus || isFetchingList;
  const error = listError ?? statusError;

  const handleClosePanel = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  return (
    <Flex h="100%">
      <Stack flex={1} px="3.5rem" py="md" gap="md">
        <DependencyListHeader />
        <DependencyListBar
          searchValue={searchValue}
          filterOptions={filterOptions}
          availableGroupTypes={AVAILABLE_GROUP_TYPES}
          hasLoader={isFetching && !isLoading}
          onSearchValueChange={setSearchValue}
          onFilterOptionsChange={setFilterOptions}
        />
        {isLoading || error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : nodes.length === 0 ? (
          <Center flex={1}>
            <DependencyListEmptyState label={t`No broken entities found`} />
          </Center>
        ) : (
          <DependencyList
            nodes={nodes}
            withDependentsCountColumn={status?.dependencies_analyzed}
            withErrorsColumn
            onSelect={setSelectedEntry}
          />
        )}
      </Stack>
      {selectedNode != null && (
        <DependencyListPanel node={selectedNode} onClose={handleClosePanel} />
      )}
    </Flex>
  );
}
