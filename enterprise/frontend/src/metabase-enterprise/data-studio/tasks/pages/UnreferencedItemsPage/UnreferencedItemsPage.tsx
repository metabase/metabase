import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { useGetUnreferencedItemsQuery } from "metabase-enterprise/api";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import type {
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import { TableSkeleton } from "./TableSkeleton";
import { UnreferencedItemsTable } from "./UnreferencedItemsTable";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

export function UnreferencedItemsPage() {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);
  const [sortColumn, setSortColumn] = useState<UnreferencedItemSortColumn>();
  const [sortDirection, setSortDirection] =
    useState<UnreferencedItemSortDirection>();
  const [pageIndex, setPageIndex] = useState(0);

  const { data, isLoading, isFetching, error } = useGetUnreferencedItemsQuery({
    query: debouncedSearch || undefined,
    sort_column: sortColumn,
    sort_direction: sortDirection,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
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
        <Button variant="default" leftSection={<Icon name="filter" />}>
          {t`Filter`}
        </Button>
      </Flex>
      {isLoading ? (
        <TableSkeleton columnWidths={[0.5, 0.125, 0.125, 0.125, 0.125]} />
      ) : !data || data.data.length === 0 ? (
        <ListEmptyState label={t`No unreferenced items found`} />
      ) : (
        <Box flex={1} mih={0} pos="relative">
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
          />
          {isFetching && (
            <Flex
              pos="absolute"
              inset={0}
              align="center"
              justify="center"
              bg="color-mix(in srgb, var(--mb-color-bg-white) 60%, transparent)"
            >
              <Loader size="lg" />
            </Flex>
          )}
        </Box>
      )}
    </Stack>
  );
}
