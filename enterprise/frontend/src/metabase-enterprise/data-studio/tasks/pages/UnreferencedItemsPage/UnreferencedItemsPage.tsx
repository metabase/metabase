import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Box, Flex, Icon, Stack, Text, TextInput } from "metabase/ui";
import { useGetUnreferencedItemsQuery } from "metabase-enterprise/api";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import type {
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import { TableSkeleton } from "../../components/TableSkeleton";
import {
  TasksFilterButton,
  type TasksFilterState,
  getFilterApiParams,
} from "../../components/TasksFilterButton";

import { UnreferencedItemsTable } from "./UnreferencedItemsTable";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

const INITIAL_FILTER_STATE: TasksFilterState = {
  entityTypes: [],
  creatorIds: [],
  lastModifiedByIds: [],
};

export function UnreferencedItemsPage() {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);
  const [sortColumn, setSortColumn] = useState<UnreferencedItemSortColumn>();
  const [sortDirection, setSortDirection] =
    useState<UnreferencedItemSortDirection>();
  const [pageIndex, setPageIndex] = useState(0);
  const [filters, setFilters] =
    useState<TasksFilterState>(INITIAL_FILTER_STATE);

  const filterApiParams = getFilterApiParams(filters);

  const { data, isLoading, isFetching, error } = useGetUnreferencedItemsQuery({
    query: debouncedSearch || undefined,
    sort_column: sortColumn,
    sort_direction: sortDirection,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
    ...filterApiParams,
  });

  const handleSortChange = useCallback(
    (column: UnreferencedItemSortColumn) => {
      setPageIndex(0);
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection("asc");
      }
    },
    [sortColumn],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.currentTarget.value);
      setPageIndex(0);
    },
    [],
  );

  const handleFilterChange = useCallback((newFilters: TasksFilterState) => {
    setFilters(newFilters);
    setPageIndex(0);
  }, []);

  if (error) {
    return (
      <Box p="lg">
        <Text c="error">{t`Error loading unreferenced items`}</Text>
      </Box>
    );
  }

  return (
    <Stack h="100%" p="lg" gap="md">
      <Flex gap="md" align="center">
        <TextInput
          flex={1}
          placeholder={t`Search...`}
          value={searchValue}
          onChange={handleSearchChange}
          leftSection={<Icon name="search" />}
        />
        <TasksFilterButton value={filters} onChange={handleFilterChange} />
      </Flex>
      {isLoading ? (
        <TableSkeleton
          columnWidths={[0.34, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11]}
        />
      ) : !data || data.data.length === 0 ? (
        <ListEmptyState label={t`No unreferenced items found`} />
      ) : (
        <Box flex={1} mih={0}>
          <UnreferencedItemsTable
            items={data.data}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            pagination={{
              total: data.total,
              pageIndex,
              pageSize: PAGE_SIZE,
              onPageChange: setPageIndex,
            }}
            isFetching={isFetching}
          />
        </Box>
      )}
    </Stack>
  );
}
