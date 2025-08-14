import { useEffect, useMemo } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import {
  useGetTableQueryMetadataQuery,
  useListTableForeignKeysQuery,
} from "metabase/api/table";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import {
  DetailsGroup,
  Header,
  Relationships,
} from "metabase/detail-view/components";
import { getHeaderColumns, getRowName } from "metabase/detail-view/utils";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar, setDetailView } from "metabase/redux/app";
import { Box, Group, Stack, rem } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import type { StructuredDatasetQuery } from "metabase-types/api";

import S from "./DetailView.module.css";
import { DETAIL_VIEW_PADDING_LEFT } from "./constants";
import { getObjectQuery } from "./utils";

interface Props {
  params: {
    tableId: string;
    rowId: string;
  };
}

export function DetailView({ params }: Props) {
  const tableId = parseInt(params.tableId, 10);
  const rowId = params.rowId;
  const dispatch = useDispatch();

  const {
    data: table,
    error: tableError,
    isLoading: isTableLoading,
  } = useGetTableQueryMetadataQuery({
    id: tableId,
  });
  const { data: tableForeignKeys } = useListTableForeignKeysQuery(tableId);

  const objectQuery = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getObjectQuery(table, rowId) : undefined;
  }, [table, rowId]);

  const {
    data: dataset,
    error: queryError,
    isLoading: isQueryLoading,
  } = useGetAdhocQueryQuery(objectQuery ? objectQuery : skipToken);

  const error = tableError ?? queryError;
  const isLoading = isTableLoading || isQueryLoading;

  const data = useMemo(() => {
    return dataset ? extractRemappedColumns(dataset.data) : undefined;
  }, [dataset]);

  const columns = useMemo(() => data?.results_metadata.columns ?? [], [data]);
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const row = useMemo(() => (data?.rows ?? [])[0], [data]);
  const rowName = getRowName(columns, row) || rowId;

  useEffect(() => {
    dispatch(closeNavbar());
  }, [dispatch]);

  useEffect(() => {
    if (table) {
      dispatch(setDetailView({ rowName, table }));
    }
  }, [dispatch, rowName, table]);

  useUnmount(() => {
    dispatch(setDetailView(null));
  });

  if (!table || !dataset || !row || error || isLoading) {
    const rowError = !row && !isLoading ? t`Row not found` : undefined;

    return (
      <LoadingAndErrorWrapper error={error ?? rowError} loading={isLoading} />
    );
  }

  return (
    <Stack bg="var(--mb-color-background-light)" gap={0} mih="100%">
      {headerColumns.length > 0 && (
        <Box
          bg="bg-white"
          className={S.header}
          pl={rem(DETAIL_VIEW_PADDING_LEFT)}
          pr="xl"
          py={rem(64)}
        >
          <Box
            // intentionally misalign the header to create an "optical alignment effect" (due to rounded avatar)
            ml={rem(-8)}
          >
            <Header columns={columns} row={row} table={table} />
          </Box>
        </Box>
      )}

      <Group align="stretch" flex="1" gap={0} key={rowId} mih={0} wrap="nowrap">
        <Group
          align="flex-start"
          bg="bg-white"
          flex="1"
          p="xl"
          pl={rem(DETAIL_VIEW_PADDING_LEFT)}
        >
          <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
            {columns.length - headerColumns.length > 0 && (
              <DetailsGroup columns={columns} row={row} table={table} />
            )}
          </Stack>
        </Group>

        {tableForeignKeys && tableForeignKeys.length > 0 && (
          <Box flex="0 0 auto" px={rem(40)} py="xl" w={rem(440)}>
            <Relationships
              columns={columns}
              row={row}
              rowId={rowId}
              rowName={rowName}
              table={table}
              tableForeignKeys={tableForeignKeys}
            />
          </Box>
        )}
      </Group>
    </Stack>
  );
}
