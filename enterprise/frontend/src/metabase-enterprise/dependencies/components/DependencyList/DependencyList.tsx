import { useMemo } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Flex, Stack } from "metabase/ui";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import type { DependencyFilterOptions } from "../../types";
import { isSameNode } from "../../utils";

import S from "./DependencyList.module.css";
import { ListBody } from "./ListBody";
import { ListEmptyState } from "./ListEmptyState";
import { ListHeader } from "./ListHeader";
import { ListSearchBar } from "./ListSearchBar";
import { ListSidebar } from "./ListSidebar";

type DependencyListProps = {
  nodes: DependencyNode[];
  selectedEntry: DependencyEntry | null;
  searchValue: string;
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  notFoundMessage: string;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  withErrorsColumn?: boolean;
  withDependentsCountColumn?: boolean;
  onSelect: (entry: DependencyEntry | null) => void;
  onSearchValueChange: (searchValue: string) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function DependencyList({
  nodes,
  searchValue,
  filterOptions,
  availableGroupTypes,
  notFoundMessage,
  isLoading,
  isFetching,
  error,
  selectedEntry,
  withErrorsColumn = false,
  withDependentsCountColumn = false,
  onSelect,
  onSearchValueChange,
  onFilterOptionsChange,
}: DependencyListProps) {
  const selectedNode = useMemo(() => {
    return selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : null;
  }, [nodes, selectedEntry]);

  return (
    <Flex h="100%">
      <Stack className={S.main} flex={1} px="3.5rem" py="md" gap="md">
        <ListHeader />
        <ListSearchBar
          searchValue={searchValue}
          filterOptions={filterOptions}
          availableGroupTypes={availableGroupTypes}
          hasLoader={isFetching && !isLoading}
          onSearchValueChange={onSearchValueChange}
          onFilterOptionsChange={onFilterOptionsChange}
        />
        {isLoading || error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : nodes.length === 0 ? (
          <Center flex={1}>
            <ListEmptyState label={notFoundMessage} />
          </Center>
        ) : (
          <ListBody
            nodes={nodes}
            withErrorsColumn={withErrorsColumn}
            withDependentsCountColumn={withDependentsCountColumn}
            onSelect={onSelect}
          />
        )}
      </Stack>
      {selectedNode != null && (
        <ListSidebar node={selectedNode} onClose={() => onSelect(null)} />
      )}
    </Flex>
  );
}
