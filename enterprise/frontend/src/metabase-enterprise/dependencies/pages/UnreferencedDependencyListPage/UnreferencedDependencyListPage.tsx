import { useDebouncedValue } from "@mantine/hooks";
import type { Location } from "history";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Center, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { useListUnreferencedNodesQuery } from "metabase-enterprise/api";

import type {
  DependencyListRawParams,
  DependencyListSortOptions,
} from "../../types";

import { UnreferencedDependencyList } from "./UnreferencedDependencyList";
import { getSearchQuery, parseRawParams } from "./utils";

const PAGE_SIZE = 25;

interface UnreferencedDependencyListPageProps {
  location?: Location<DependencyListRawParams>;
}

export function UnreferencedDependencyListPage({
  location,
}: UnreferencedDependencyListPageProps) {
  const params = useMemo(
    () => parseRawParams(location?.query),
    [location?.query],
  );
  const { page = 0, sortColumn = "name", sortDirection = "asc" } = params;
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    getSearchQuery(searchValue),
    SEARCH_DEBOUNCE_DURATION,
  );
  const dispatch = useDispatch();

  const { data, isLoading, error } = useListUnreferencedNodesQuery({
    types: ["table", "card", "snippet"],
    card_types: ["question", "model", "metric"],
    query: searchQuery,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    sort_column: sortColumn,
    sort_direction: sortDirection,
  });

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

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchValue(event.target.value);
    },
    [],
  );

  const handleSortChange = useCallback(
    (sortOptions: DependencyListSortOptions) => {
      dispatch(
        push(
          Urls.dataStudioUnreferencedItems({
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
        push(
          Urls.dataStudioUnreferencedItems({ ...params, page: newPageIndex }),
        ),
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
      </Flex>
      <Box flex={1} mih={0}>
        <UnreferencedDependencyList
          items={data.data}
          sortOptions={sortOptions}
          paginationOptions={paginationOptions}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
        />
      </Box>
    </Stack>
  );
}
