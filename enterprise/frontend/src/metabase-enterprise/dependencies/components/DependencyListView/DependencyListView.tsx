import { type ChangeEvent, useMemo } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Flex, Icon, Loader, Stack, TextInput } from "metabase/ui";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import type { DependencyFilterOptions } from "../../types";
import { isSameNode } from "../../utils";

import { DependencyList } from "./DependencyList";
import { DependencyPanel } from "./DependencyPanel";
import { FilterOptionsPicker } from "./FilterOptionsPicker";
import { ListEmptyState } from "./ListEmptyState";
import { ListHeader } from "./ListHeader";

type DependencyListViewProps = {
  nodes: DependencyNode[];
  selectedEntry: DependencyEntry | null;
  searchValue: string;
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  nothingFoundMessage: string;
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  withErrorsColumn?: boolean;
  withDependentsCountColumn?: boolean;
  onSelect: (node: DependencyNode | null) => void;
  onSearchValueChange: (searchValue: string) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function DependencyListView({
  nodes,
  selectedEntry,
  searchValue,
  filterOptions,
  availableGroupTypes,
  nothingFoundMessage,
  isFetching,
  isLoading,
  error,
  withErrorsColumn = false,
  withDependentsCountColumn = false,
  onSelect,
  onSearchValueChange,
  onFilterOptionsChange,
}: DependencyListViewProps) {
  const selectedNode = useMemo(() => {
    return selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : null;
  }, [nodes, selectedEntry]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchValueChange(event.target.value);
  };

  return (
    <Flex h="100%">
      <Stack flex={1} px="3.5rem" py="md" gap="md">
        <ListHeader />
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
        {isLoading || nodes.length === 0 ? (
          <Center flex={1}>
            {isLoading ? (
              <DelayedLoadingAndErrorWrapper
                loading={isLoading}
                error={error}
              />
            ) : (
              <ListEmptyState label={nothingFoundMessage} />
            )}
          </Center>
        ) : (
          <DependencyList
            nodes={nodes}
            withErrorsColumn={withErrorsColumn}
            withDependentsCountColumn={withDependentsCountColumn}
            onSelect={onSelect}
          />
        )}
      </Stack>
      {selectedNode != null && (
        <DependencyPanel node={selectedNode} onClose={() => onSelect(null)} />
      )}
    </Flex>
  );
}
