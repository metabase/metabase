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
import { useDispatch } from "metabase/lib/redux";
import type { DatasetColumn, StructuredDatasetQuery } from "metabase-types/api";

import {
  getObjectQuery,
  getTableQuery,
  processRemappedColumns,
} from "../utils";

import { TableDetailViewInner } from "./TableDetailViewInner";

const emptyColumns: DatasetColumn[] = [];

interface TableDetailViewLoaderProps {
  params: {
    tableId: string;
    rowId: string;
  };
  isEdit?: boolean;
  router: { location: LocationDescriptorObject };
}

export function TableDetailView({
  params,
  isEdit = false,
  router: { location },
}: TableDetailViewLoaderProps) {
  const tableId = parseInt(params.tableId, 10);
  const rowId = params.rowId;
  const dispatch = useDispatch();

  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });
  const { data: tableForeignKeys = [] } = useListTableForeignKeysQuery(tableId);

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getTableQuery(table) : undefined;
  }, [table]);

  const objectQuery = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getObjectQuery(table, rowId) : undefined;
  }, [table, rowId]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);

  const [currentRowIndex, setCurrentRowIndex] = useState<number>();

  const rows = useMemo(() => dataset?.data?.rows || [], [dataset]);
  const columns = dataset?.data?.results_metadata?.columns ?? emptyColumns;

  const { columns: processedColumns, rows: processedRows } = useMemo(() => {
    if (columns.length > 0 && rows.length > 0) {
      return processRemappedColumns(columns, rows);
    }
    return { columns, rows };
  }, [columns, rows]);

  const rowFromList =
    typeof currentRowIndex === "undefined"
      ? undefined
      : processedRows[currentRowIndex];

  const { data: objectDataset } = useGetAdhocQueryQuery(
    objectQuery ? objectQuery : skipToken,
  );
  const rowFromObject = useMemo(
    () => (objectDataset?.data?.rows ?? [])[0],
    [objectDataset],
  );

  const row = rowFromList ?? rowFromObject;

  const [previousPathState] = useState<
    | {
        pathname: string;
        hash: string;
      }
    | object
  >(() => location.state);

  const handleBackClick = useMemo(() => {
    return "hash" in previousPathState
      ? () => dispatch(push(previousPathState))
      : undefined;
  }, [dispatch, previousPathState]);

  // Handle row selection based on rowId
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

  const handleViewPreviousObjectDetail = useCallback(() => {
    setCurrentRowIndex((i) => {
      const newIndex = i - 1;
      const rowId = rows[newIndex]?.[0];
      if (rowId !== undefined) {
        dispatch(
          push({
            pathname: `/table/${tableId}/detail/${rowId}${isEdit ? "/edit" : ""}`,
            state: {
              hash: location.state?.hash,
              pathname: location.state?.pathname,
            },
          }),
        );
      }
      return newIndex;
    });
  }, [
    rows,
    dispatch,
    tableId,
    isEdit,
    location.state?.hash,
    location.state?.pathname,
  ]);

  const handleViewNextObjectDetail = useCallback(() => {
    setCurrentRowIndex((i) => {
      const newIndex = i + 1;
      const rowId = rows[newIndex]?.[0];
      if (rowId !== undefined) {
        dispatch(
          push({
            pathname: `/table/${tableId}/detail/${rowId}${isEdit ? "/edit" : ""}`,
            state: {
              hash: location.state?.hash,
              pathname: location.state?.pathname,
            },
          }),
        );
      }
      return newIndex;
    });
  }, [
    rows,
    dispatch,
    tableId,
    isEdit,
    location.state?.hash,
    location.state?.pathname,
  ]);

  if (!table || !dataset || !row) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <TableDetailViewInner
      tableId={tableId}
      rowId={rowId}
      row={row}
      columns={processedColumns}
      table={table}
      tableForeignKeys={tableForeignKeys}
      isEdit={isEdit}
      onPreviousItemClick={
        rows.length > 1 &&
        typeof currentRowIndex === "number" &&
        currentRowIndex > 0
          ? handleViewPreviousObjectDetail
          : undefined
      }
      onNextItemClick={
        rows.length > 1 &&
        typeof currentRowIndex === "number" &&
        currentRowIndex < rows.length - 1
          ? handleViewNextObjectDetail
          : undefined
      }
      onBackClick={handleBackClick}
    />
  );
}
