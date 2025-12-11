import { useDebouncedCallback } from "@mantine/hooks";
import type { Location } from "history";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Center, Flex, Icon, Loader, Stack, TextInput } from "metabase/ui";
import {
  useListBrokenGraphNodesQuery,
  useListUnreferencedGraphNodesQuery,
} from "metabase-enterprise/api";
import type {
  CardType,
  DependencyGroupType,
  DependencyNode,
  DependencySortColumn,
  DependencySortDirection,
  DependencyType,
} from "metabase-types/api";

import { ListEmptyState } from "../../components/ListEmptyState";
import type {
  DependencyListFilterOptions,
  DependencyListRawParams,
  DependencyListSortOptions,
} from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

import { DependencyList } from "./DependencyList";
import { ListFilterPicker } from "./ListFilterPicker";
import {
  BROKEN_GROUP_TYPES,
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  UNREFERENCED_GROUP_TYPES,
} from "./constants";
import { parseRawParams } from "./utils";

type ListNodesRequest = {
  types?: DependencyType[];
  card_types?: CardType[];
  query?: string;
  sort_column?: DependencySortColumn;
  sort_direction?: DependencySortDirection;
  limit?: number;
  offset?: number;
};

type ListNodesResponse = {
  data: DependencyNode[];
  sort_column: DependencySortColumn;
  sort_direction: DependencySortDirection;
  limit: number;
  offset: number;
  total: number;
};

type ListNodesResult = {
  data?: ListNodesResponse;
  isFetching?: boolean;
  isLoading?: boolean;
  error?: unknown;
};

type DependencyListPageProps = {
  useListNodesQuery: (request: ListNodesRequest) => ListNodesResult;
  params: Urls.DependencyListParams;
  availableGroupTypes: DependencyGroupType[];
  nothingFoundMessage: string;
  withDependentsCountColumn: boolean;
  onParamsChange: (
    params: Urls.DependencyListParams,
    withReplace?: boolean,
  ) => void;
};

function DependencyListPage({
  useListNodesQuery,
  params,
  availableGroupTypes,
  nothingFoundMessage,
  withDependentsCountColumn,
  onParamsChange,
}: DependencyListPageProps) {
  const {
    query = "",
    page = 0,
    types,
    sortColumn = DEFAULT_SORT_COLUMN,
    sortDirection = DEFAULT_SORT_DIRECTION,
  } = params;
  const [searchValue, setSearchValue] = useState("");

  const { data, isFetching, isLoading, error } = useListNodesQuery({
    query,
    types: getDependencyTypes(types ?? availableGroupTypes),
    card_types: getCardTypes(types ?? availableGroupTypes),
    sort_column: sortColumn,
    sort_direction: sortDirection,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const filterOptions = useMemo(
    () => ({
      groupTypes: types ?? [],
    }),
    [types],
  );

  const sortOptions = useMemo(
    () => ({
      column: sortColumn,
      direction: sortDirection,
    }),
    [sortColumn, sortDirection],
  );

  const paginationOptions = useMemo(
    () => ({
      pageIndex: page,
      pageSize: PAGE_SIZE,
      total: data?.total ?? 0,
    }),
    [page, data?.total],
  );

  const handleSearchDebounce = useDebouncedCallback(
    (query: string | undefined) => {
      onParamsChange({ ...params, query }, true);
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

  const handleFilterOptionsChange = useCallback(
    (filterOptions: DependencyListFilterOptions) => {
      onParamsChange({
        ...params,
        types: filterOptions.groupTypes,
      });
    },
    [params, onParamsChange],
  );

  const handleSortChange = useCallback(
    (sortOptions: DependencyListSortOptions) => {
      onParamsChange({
        ...params,
        sortColumn: sortOptions.column,
        sortDirection: sortOptions.direction,
      });
    },
    [params, onParamsChange],
  );

  const handlePageChange = useCallback(
    (newPageIndex: number) => {
      onParamsChange({
        ...params,
        page: newPageIndex,
      });
    },
    [params, onParamsChange],
  );

  if (isLoading || error != null || data == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Stack flex={1} gap="md" mih={0}>
      <Flex gap="md" align="center">
        <TextInput
          value={searchValue}
          placeholder={t`Search…`}
          flex={1}
          leftSection={<Icon name="search" />}
          rightSection={isFetching ? <Loader size="sm" /> : undefined}
          onChange={handleSearchChange}
        />
        <ListFilterPicker
          filterOptions={filterOptions}
          availableGroupTypes={availableGroupTypes}
          onFilterOptionsChange={handleFilterOptionsChange}
        />
      </Flex>
      <Box flex={1} mih={0}>
        {data.data.length === 0 ? (
          <Center h="100%">
            <ListEmptyState label={nothingFoundMessage} />
          </Center>
        ) : (
          <DependencyList
            items={data.data}
            sortOptions={sortOptions}
            paginationOptions={paginationOptions}
            withDependentsCountColumn={withDependentsCountColumn}
            onSortChange={handleSortChange}
            onPageChange={handlePageChange}
          />
        )}
      </Box>
    </Stack>
  );
}

type BrokenDependencyListPageProps = {
  location: Location<DependencyListRawParams>;
};

export function BrokenDependencyListPage({
  location,
}: BrokenDependencyListPageProps) {
  const params = useMemo(
    () => parseRawParams(location.query),
    [location.query],
  );
  const dispatch = useDispatch();

  const handleParamsChange = useCallback(
    (params: Urls.DependencyListParams, withReplace?: boolean) => {
      dispatch(
        withReplace
          ? replace(Urls.dataStudioBrokenItems(params))
          : push(Urls.dataStudioBrokenItems(params)),
      );
    },
    [dispatch],
  );

  return (
    <DependencyListPage
      useListNodesQuery={useListBrokenGraphNodesQuery}
      params={params}
      availableGroupTypes={BROKEN_GROUP_TYPES}
      nothingFoundMessage={t`No broken entities found`}
      withDependentsCountColumn
      onParamsChange={handleParamsChange}
    />
  );
}

type UnreferencedDependencyListPageProps = {
  location: Location<DependencyListRawParams>;
};

export function UnreferencedDependencyListPage({
  location,
}: UnreferencedDependencyListPageProps) {
  const params = useMemo(
    () => parseRawParams(location.query),
    [location.query],
  );
  const dispatch = useDispatch();

  const handleParamsChange = useCallback(
    (params: Urls.DependencyListParams, withReplace?: boolean) => {
      dispatch(
        withReplace
          ? replace(Urls.dataStudioUnreferencedItems(params))
          : push(Urls.dataStudioUnreferencedItems(params)),
      );
    },
    [dispatch],
  );

  return (
    <DependencyListPage
      useListNodesQuery={useListUnreferencedGraphNodesQuery}
      params={params}
      availableGroupTypes={UNREFERENCED_GROUP_TYPES}
      nothingFoundMessage={t`No unreferenced entities found`}
      withDependentsCountColumn={false}
      onParamsChange={handleParamsChange}
    />
  );
}
