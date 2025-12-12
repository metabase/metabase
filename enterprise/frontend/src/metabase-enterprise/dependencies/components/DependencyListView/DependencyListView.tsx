import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import {
  Center,
  Flex,
  Icon,
  Loader,
  Pagination,
  Stack,
  TextInput,
} from "metabase/ui";
import type { DependencyGroupType, DependencyNode } from "metabase-types/api";

import { DependencyList } from "./DependencyList";
import S from "./DependencyListView.module.css";
import { FilterOptionsPicker } from "./FilterOptionsPicker";
import { ListEmptyState } from "./ListEmptyState";
import { ListHeader } from "./ListHeader";
import type { DependencyListViewParams } from "./types";
import { getSearchQuery } from "./utils";

type DependencyListViewProps = {
  nodes: DependencyNode[];
  params: DependencyListViewParams;
  error: unknown;
  availableGroupTypes: DependencyGroupType[];
  nothingFoundMessage: string;
  pageSize: number;
  totalNodes: number;
  isFetching: boolean;
  isLoading: boolean;
  withErrorsColumn?: boolean;
  withDependentsCountColumn?: boolean;
  onParamsChange: (
    params: DependencyListViewParams,
    withReplace?: boolean,
  ) => void;
};

export function DependencyListView({
  nodes,
  params,
  availableGroupTypes,
  nothingFoundMessage,
  pageSize,
  totalNodes,
  isFetching,
  isLoading,
  error,
  withErrorsColumn = false,
  withDependentsCountColumn = false,
  onParamsChange,
}: DependencyListViewProps) {
  const { query = "", pageIndex = 0 } = params;
  const [searchValue, setSearchValue] = useState(query);
  const pageNumber = pageIndex + 1;
  const totalPages = Math.ceil(totalNodes / pageSize);

  const handleSearchDebounce = useDebouncedCallback(
    (query: string | undefined) => {
      onParamsChange({ ...params, query, pageIndex: 0 }, true);
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const searchValue = event.target.value;
      setSearchValue(searchValue);
      handleSearchDebounce(getSearchQuery(searchValue));
    },
    [handleSearchDebounce],
  );

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      onParamsChange({ ...params, pageIndex: pageNumber - 1 });
    },
    [params, onParamsChange],
  );

  return (
    <Stack className={S.root} flex={1} px="3.5rem" py="md" gap="md" h="100%">
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
          params={params}
          availableGroupTypes={availableGroupTypes}
          onParamsChange={onParamsChange}
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
        <Stack flex={1} mih={0}>
          <DependencyList
            nodes={nodes}
            withErrorsColumn={withErrorsColumn}
            withDependentsCountColumn={withDependentsCountColumn}
          />
          <Center>
            <Pagination
              value={pageNumber}
              total={totalPages}
              onChange={handlePageChange}
            />
          </Center>
        </Stack>
      )}
    </Stack>
  );
}
