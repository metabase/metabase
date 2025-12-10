import { useDebouncedCallback } from "@mantine/hooks";
import type { Location } from "history";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Center, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { useListBrokenNodesQuery } from "metabase-enterprise/api";

import { DependencyFilterPicker } from "../../components/DependencyFilterPicker";
import { DependencyList } from "../../components/DependencyList";
import { ListEmptyState } from "../../components/ListEmptyState";
import type {
  DependencyListFilterOptions,
  DependencyListRawParams,
  DependencyListSortOptions,
} from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

import {
  AVAILABLE_GROUP_TYPES,
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
} from "./constants";
import { parseRawParams } from "./utils";

interface BrokenDependencyListPageProps {
  location?: Location<DependencyListRawParams>;
}

export function BrokenDependencyListPage({
  location,
}: BrokenDependencyListPageProps) {
  const params = useMemo(
    () => parseRawParams(location?.query),
    [location?.query],
  );
  const {
    query = "",
    page = 0,
    types,
    sortColumn = DEFAULT_SORT_COLUMN,
    sortDirection = DEFAULT_SORT_DIRECTION,
  } = params;
  const [searchValue, setSearchValue] = useState("");
  const dispatch = useDispatch();

  const { data, isLoading, error } = useListBrokenNodesQuery({
    query,
    types: getDependencyTypes(types ?? AVAILABLE_GROUP_TYPES),
    card_types: getCardTypes(types ?? AVAILABLE_GROUP_TYPES),
    sort_column: sortColumn,
    sort_direction: sortDirection,
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
      dispatch(replace(Urls.dataStudioBrokenItems({ ...params, query })));
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
      dispatch(
        push(
          Urls.dataStudioBrokenItems({
            ...params,
            types: filterOptions.groupTypes,
          }),
        ),
      );
    },
    [params, dispatch],
  );

  const handleSortChange = useCallback(
    (sortOptions: DependencyListSortOptions) => {
      dispatch(
        push(
          Urls.dataStudioBrokenItems({
            ...params,
            sortColumn: sortOptions.column,
            sortDirection: sortOptions.direction,
          }),
        ),
      );
    },
    [params, dispatch],
  );

  const handlePageChange = useCallback(
    (newPageIndex: number) => {
      dispatch(
        push(Urls.dataStudioBrokenItems({ ...params, page: newPageIndex })),
      );
    },
    [params, dispatch],
  );

  if (isLoading || error != null || data == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Stack h="100%" p="lg" gap="md">
      <Flex gap="md" align="center">
        <TextInput
          value={searchValue}
          placeholder={t`Search…`}
          flex={1}
          leftSection={<Icon name="search" />}
          onChange={handleSearchChange}
        />
        <DependencyFilterPicker
          filterOptions={filterOptions}
          availableGroupTypes={AVAILABLE_GROUP_TYPES}
          onFilterOptionsChange={handleFilterOptionsChange}
        />
      </Flex>
      <Box flex={1} mih={0}>
        {data.data.length === 0 ? (
          <Center h="100%">
            <ListEmptyState label={t`No broken entities found`} />
          </Center>
        ) : (
          <DependencyList
            items={data.data}
            sortOptions={sortOptions}
            paginationOptions={paginationOptions}
            onSortChange={handleSortChange}
            onPageChange={handlePageChange}
          />
        )}
      </Box>
    </Stack>
  );
}
