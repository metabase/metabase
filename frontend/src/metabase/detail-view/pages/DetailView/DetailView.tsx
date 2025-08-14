import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useUnmount } from "react-use";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import {
  useGetTableQueryMetadataQuery,
  useListTableForeignKeysQuery,
} from "metabase/api/table";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import {
  DetailsGroup,
  Footer,
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
import { getObjectQuery, getTableQuery } from "./utils";

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

  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });
  const { data: tableForeignKeys } = useListTableForeignKeysQuery(tableId);

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getTableQuery(table) : undefined;
  }, [table]);

  const objectQuery = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getObjectQuery(table, rowId) : undefined;
  }, [table, rowId]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);
  const data = useMemo(() => {
    return dataset ? extractRemappedColumns(dataset.data) : undefined;
  }, [dataset]);

  const [currentRowIndex, setCurrentRowIndex] = useState<number>();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => data?.results_metadata.columns ?? [], [data]);
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);

  const rowFromList =
    typeof currentRowIndex === "undefined" ? undefined : rows[currentRowIndex];

  const { data: objectDataset } = useGetAdhocQueryQuery(
    objectQuery ? objectQuery : skipToken,
  );
  const rowFromObject = useMemo(
    () => (objectDataset?.data?.rows ?? [])[0],
    [objectDataset],
  );

  const row = rowFromList ?? rowFromObject;
  const rowName = getRowName(columns, row) || rowId;

  const handleViewPreviousObjectDetail = useCallback(() => {
    setCurrentRowIndex((currentIndex) => {
      if (typeof currentIndex !== "number") {
        return currentIndex;
      }

      const newIndex = currentIndex - 1;
      const rowId = rows[newIndex]?.[0];

      if (rowId !== undefined) {
        dispatch(push(`/table/${tableId}/detail/${rowId}`));
      }

      return newIndex;
    });
  }, [rows, dispatch, tableId]);

  const handleViewNextObjectDetail = useCallback(() => {
    setCurrentRowIndex((currentIndex) => {
      if (typeof currentIndex !== "number") {
        return currentIndex;
      }

      const newIndex = currentIndex + 1;
      const rowId = rows[newIndex]?.[0];

      if (rowId !== undefined) {
        dispatch(push(`/table/${tableId}/detail/${rowId}`));
      }

      return newIndex;
    });
  }, [rows, dispatch, tableId]);

  const handlePreviousClick =
    rows.length > 1 &&
    typeof currentRowIndex === "number" &&
    currentRowIndex > 0
      ? handleViewPreviousObjectDetail
      : undefined;

  const handleNextClick =
    rows.length > 1 &&
    typeof currentRowIndex === "number" &&
    currentRowIndex < rows.length - 1
      ? handleViewNextObjectDetail
      : undefined;

  useEffect(() => {
    if (!row) {
      return;
    }

    if (rowId !== undefined) {
      const idx = rows.findIndex((row) => String(row[0]) === String(rowId));
      setCurrentRowIndex(idx >= 0 ? idx : undefined);
    } else {
      setCurrentRowIndex(undefined);
    }
  }, [rowId, rows, row]);

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

  if (!table || !dataset || !row) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Stack bg="var(--mb-color-background-light)" gap={0} h="100%">
      <Stack className={S.scrollable} gap={0} mih={0} h="100%">
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

        <Group
          align="flex-start"
          flex="1"
          gap={0}
          key={rowId}
          mih={0}
          wrap="nowrap"
        >
          <Group
            align="flex-start"
            mih="100%"
            flex="1"
            bg="bg-white"
            p="xl"
            pl={rem(DETAIL_VIEW_PADDING_LEFT)}
          >
            <Stack gap={rem(64)} maw={rem(900)} w="100%">
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

      {typeof currentRowIndex === "number" &&
        typeof dataset?.row_count === "number" && (
          <Box bg="bg-white" className={S.footer} flex="0 0 auto">
            <Footer
              index={currentRowIndex}
              rowsCount={dataset.row_count}
              onNextClick={handleNextClick}
              onPreviousClick={handlePreviousClick}
            />
          </Box>
        )}
    </Stack>
  );
}
