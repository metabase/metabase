import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Flex, Icon, Select, Stack, Text, TextInput } from "metabase/ui";
import { useGetUnreferencedItemsQuery } from "metabase-enterprise/api";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import type {
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import { TableSkeleton } from "../../components/TableSkeleton";
import {
  type EntityTypeFilterValue,
  TasksFilterButton,
  type TasksFilterState,
  getFilterApiParams,
} from "../../components/TasksFilterButton";

import { UnreferencedItemsTable } from "./UnreferencedItemsTable";
import {
  ENTITY_TYPE_OPTIONS,
  INITIAL_FILTER_STATE,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  VALID_ENTITY_TYPES,
} from "./constants";

interface UnreferencedItemsPageProps {
  params: {
    entityType: string;
  };
}

export function UnreferencedItemsPage({ params }: UnreferencedItemsPageProps) {
  const dispatch = useDispatch();
  const entityType = VALID_ENTITY_TYPES.has(params.entityType)
    ? (params.entityType as EntityTypeFilterValue)
    : "model";

  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);
  const [sortColumn, setSortColumn] = useState<UnreferencedItemSortColumn>();
  const [sortDirection, setSortDirection] =
    useState<UnreferencedItemSortDirection>();
  const [pageIndex, setPageIndex] = useState(0);
  const [filters, setFilters] =
    useState<TasksFilterState>(INITIAL_FILTER_STATE);

  useEffect(() => {
    setPageIndex(0);
    setSortColumn(undefined);
    setSortDirection(undefined);
  }, [entityType]);

  const filterApiParams = getFilterApiParams({
    ...filters,
    entityTypes: [entityType],
  });

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

  const handleEntityTypeChange = useCallback(
    (value: string | null) => {
      if (value && VALID_ENTITY_TYPES.has(value)) {
        dispatch(push(Urls.dataStudioTasksUnreferenced(value)));
      }
    },
    [dispatch],
  );

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
        <Select
          data={ENTITY_TYPE_OPTIONS}
          value={entityType}
          onChange={handleEntityTypeChange}
          allowDeselect={false}
          miw={200}
        />
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
            entityType={entityType}
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
