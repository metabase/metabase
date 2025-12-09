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
import { useListUnreferencedItemsQuery } from "metabase-enterprise/api";
import type { UnreferencedItemSortColumn } from "metabase-types/api";

import { UnreferencedItemsTable } from "./UnreferencedItemsTable";
import type { UnreferencedItemsRawParams } from "./types";
import { getSearchQuery, parseRawParams } from "./utils";

const PAGE_SIZE = 25;

interface UnreferencedItemsPageProps {
  location: Location<UnreferencedItemsRawParams>;
}

export function UnreferencedItemsPage({
  location,
}: UnreferencedItemsPageProps) {
  const params = useMemo(
    () => parseRawParams(location.query),
    [location.query],
  );
  const { page = 0, sortColumn = "name", sortDirection = "asc" } = params;
  const dispatch = useDispatch();

  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    getSearchQuery(searchValue),
    SEARCH_DEBOUNCE_DURATION,
  );

  const { data, isLoading, error } = useListUnreferencedItemsQuery(
    useMemo(
      () => ({
        types: ["table", "card", "snippet"],
        card_types: ["question", "model", "metric"],
        query: searchQuery,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        sort_column: sortColumn,
        sort_direction: sortDirection,
      }),
      [searchQuery, page, sortColumn, sortDirection],
    ),
  );

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchValue(event.target.value);
    },
    [],
  );

  const handleSortChange = useCallback(
    (newSortColumn: UnreferencedItemSortColumn) => {
      dispatch(
        push(
          Urls.dataStudioTasksUnreferenced({
            ...params,
            sortColumn: newSortColumn,
            sortDirection:
              sortColumn === newSortColumn && sortDirection === "asc"
                ? "desc"
                : "asc",
          }),
        ),
      );
    },
    [params, sortColumn, sortDirection, dispatch],
  );

  const handlePageChange = useCallback(
    (newPageIndex: number) => {
      dispatch(
        push(
          Urls.dataStudioTasksUnreferenced({ ...params, page: newPageIndex }),
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
        <UnreferencedItemsTable
          items={data.data}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          pageIndex={page}
          pageSize={PAGE_SIZE}
          pageTotal={data.total}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
        />
      </Box>
    </Stack>
  );
}
