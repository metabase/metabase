import type { LocationDescriptorObject } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import {
  useGetTableQueryMetadataQuery,
  useListTableForeignKeysQuery,
} from "metabase/api/table";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { Details, Nav, Relationships } from "metabase/detail-view/components";
import { getRowName } from "metabase/detail-view/utils";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { Box, Group, Stack, rem } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import type { StructuredDatasetQuery } from "metabase-types/api";

import S from "./DetailView.module.css";
import { getObjectQuery, getTableQuery } from "./utils";

interface TableDetailViewLoaderProps {
  params: {
    tableId: string;
    rowId: string;
  };
  router: { location: LocationDescriptorObject };
}

export function DetailView({
  params,
  router: { location },
}: TableDetailViewLoaderProps) {
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
  const rowName = getRowName(columns, row);

  const [previousPathState] = useState<
    { pathname: string; hash: string } | object
  >(() => location.state ?? {});

  const handleBackClick = useCallback(() => {
    dispatch(push(previousPathState));
  }, [dispatch, previousPathState]);

  const handleViewPreviousObjectDetail = useCallback(() => {
    setCurrentRowIndex((currentIndex) => {
      if (typeof currentIndex !== "number") {
        return currentIndex;
      }

      const newIndex = currentIndex - 1;
      const rowId = rows[newIndex]?.[0];

      if (rowId !== undefined) {
        dispatch(
          push({
            pathname: `/table/${tableId}/detail/${rowId}`,
            state: {
              hash: location.state?.hash,
              pathname: location.state?.pathname,
            },
          }),
        );
      }

      return newIndex;
    });
  }, [rows, dispatch, tableId, location.state]);

  const handleViewNextObjectDetail = useCallback(() => {
    setCurrentRowIndex((currentIndex) => {
      if (typeof currentIndex !== "number") {
        return currentIndex;
      }

      const newIndex = currentIndex + 1;
      const rowId = rows[newIndex]?.[0];

      if (rowId !== undefined) {
        dispatch(
          push({
            pathname: `/table/${tableId}/detail/${rowId}`,
            state: {
              hash: location.state?.hash,
              pathname: location.state?.pathname,
            },
          }),
        );
      }

      return newIndex;
    });
  }, [rows, dispatch, tableId, location.state]);

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

  if (!table || !dataset || !row) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Stack bg="bg-white" gap={0} h="100%">
      <Box className={S.nav} flex="0 0 auto" p="md">
        <Nav
          rowName={rowName}
          tableId={tableId}
          onBackClick={
            "hash" in previousPathState ? handleBackClick : undefined
          }
          onPreviousClick={
            rows.length > 1 &&
            typeof currentRowIndex === "number" &&
            currentRowIndex > 0
              ? handleViewPreviousObjectDetail
              : undefined
          }
          onNextClick={
            rows.length > 1 &&
            typeof currentRowIndex === "number" &&
            currentRowIndex < rows.length - 1
              ? handleViewNextObjectDetail
              : undefined
          }
        />
      </Box>

      <Group
        align="flex-start"
        className={S.content}
        flex="1"
        gap={rem(72)}
        mih={0}
      >
        <Group justify="center" flex="1" px="xl" py={rem(64)}>
          <Box maw={rem(900)}>
            <Details />
          </Box>
        </Group>

        {tableForeignKeys && tableForeignKeys.length > 0 && (
          <Box flex="0 0 auto">
            <Relationships />
          </Box>
        )}
      </Group>
    </Stack>
  );
}
