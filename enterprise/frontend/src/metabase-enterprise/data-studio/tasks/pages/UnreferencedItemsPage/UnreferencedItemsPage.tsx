import type { Location } from "history";
import { push } from "react-router-redux";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Center, Stack } from "metabase/ui";
import { useListUnreferencedItemsQuery } from "metabase-enterprise/api";
import type { UnreferencedItemSortColumn } from "metabase-types/api";

import { UnreferencedItemsTable } from "./UnreferencedItemsTable";
import type { UnreferencedItemsRawParams } from "./types";
import { parseRawParams } from "./utils";

const PAGE_SIZE = 25;

interface UnreferencedItemsPageProps {
  location: Location<UnreferencedItemsRawParams>;
}

export function UnreferencedItemsPage({
  location,
}: UnreferencedItemsPageProps) {
  const params = parseRawParams(location.query);
  const { page = 0, sortColumn, sortDirection } = params;
  const dispatch = useDispatch();

  const { data, isLoading, error } = useListUnreferencedItemsQuery({
    types: ["table", "card", "snippet"],
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    sort_column: sortColumn,
    sort_direction: sortDirection,
  });

  const handleSortChange = (newSortColumn: UnreferencedItemSortColumn) => {
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
  };

  const handlePageChange = (newPageIndex: number) => {
    dispatch(
      push(Urls.dataStudioTasksUnreferenced({ ...params, page: newPageIndex })),
    );
  };

  if (isLoading || error != null || data == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Stack h="100%" p="lg" gap="md">
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
