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
import type { RowValues, StructuredDatasetQuery } from "metabase-types/api";

import { getTableQuery } from "../utils";

import { TableDetailViewInner } from "./TableDetailViewInner";

interface TableDetailViewLoaderProps {
  params: {
    tableId: string;
    rowId: string;
  };
  isEdit?: boolean;
}

export function TableDetailView({
  params,
  isEdit = false,
}: TableDetailViewLoaderProps) {
  const tableId = parseInt(params.tableId, 10);
  const rowId = params.rowId;
  const dispatch = useDispatch();

  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });
  const { data: tableForeignKeys = [] } = useListTableForeignKeysQuery(tableId);

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getTableQuery(table) : undefined;
  }, [table]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);

  const [currentRowIndex, setCurrentRowIndex] = useState(0);

  const rows = useMemo(() => dataset?.data?.rows || [], [dataset]);
  const columns = dataset?.data?.results_metadata?.columns ?? [];
  const row: RowValues = rows[currentRowIndex] || [];

  // Handle row selection based on rowId
  useEffect(() => {
    if (!rows.length) {
      return;
    }
    if (rowId !== undefined) {
      const idx = rows.findIndex((row) => String(row[0]) === String(rowId));
      setCurrentRowIndex(idx >= 0 ? idx : 0);
    } else {
      setCurrentRowIndex(0);
    }
  }, [rowId, rows]);

  const handleViewPreviousObjectDetail = useCallback(() => {
    setCurrentRowIndex((i) => {
      const newIndex = i - 1;
      const rowId = rows[newIndex]?.[0];
      if (rowId !== undefined) {
        dispatch(
          push(`/table/${tableId}/detail/${rowId}${isEdit ? "/edit" : ""}`),
        );
      }
      return newIndex;
    });
  }, [dispatch, rows, tableId, isEdit]);

  const handleViewNextObjectDetail = useCallback(() => {
    setCurrentRowIndex((i) => {
      const newIndex = i + 1;
      const rowId = rows[newIndex]?.[0];
      if (rowId !== undefined) {
        dispatch(
          push(`/table/${tableId}/detail/${rowId}${isEdit ? "/edit" : ""}`),
        );
      }
      return newIndex;
    });
  }, [dispatch, rows, tableId, isEdit]);

  if (!table || !dataset) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <TableDetailViewInner
      tableId={tableId}
      rowId={rowId}
      row={row}
      columns={columns}
      table={table}
      tableForeignKeys={tableForeignKeys}
      isEdit={isEdit}
      onPreviousItemClick={
        rows.length > 1 && currentRowIndex > 0
          ? handleViewPreviousObjectDetail
          : undefined
      }
      onNextItemClick={
        rows.length > 1 && currentRowIndex < rows.length - 1
          ? handleViewNextObjectDetail
          : undefined
      }
    />
  );
}
