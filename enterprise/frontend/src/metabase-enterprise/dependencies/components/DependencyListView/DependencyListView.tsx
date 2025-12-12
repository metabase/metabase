import type { ChangeEvent } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Center, Flex, Icon, Loader, Stack, TextInput } from "metabase/ui";
import type { DependencyGroupType, DependencyNode } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../types";

import { DependencyList } from "./DependencyList";
import { FilterOptionsPicker } from "./FilterOptionsPicker";
import { ListEmptyState } from "./ListEmptyState";
import { ListHeader } from "./ListHeader";

type DependencyListViewProps = {
  nodes: DependencyNode[];
  searchValue: string;
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  nothingFoundMessage: string;
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  withErrorsColumn?: boolean;
  withDependentsCountColumn?: boolean;
  onSearchValueChange: (searchValue: string) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function DependencyListView({
  nodes,
  searchValue,
  filterOptions,
  availableGroupTypes,
  nothingFoundMessage,
  isFetching,
  isLoading,
  error,
  withErrorsColumn = false,
  withDependentsCountColumn = false,
  onSearchValueChange,
  onFilterOptionsChange,
}: DependencyListViewProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchValueChange(event.target.value);
  };

  return (
    <Stack flex={1} px="3.5rem" py="md" gap="md" h="100%">
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
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          ) : (
            <ListEmptyState label={nothingFoundMessage} />
          )}
        </Center>
      ) : (
        <Box flex={1} mih={0}>
          <DependencyList
            nodes={nodes}
            withErrorsColumn={withErrorsColumn}
            withDependentsCountColumn={withDependentsCountColumn}
          />
        </Box>
      )}
    </Stack>
  );
}
