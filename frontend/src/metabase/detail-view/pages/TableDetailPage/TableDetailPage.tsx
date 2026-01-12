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
import { DetailViewPage } from "metabase/detail-view/components";
import {
  filterByPk,
  getRowName,
  getTableQuery,
} from "metabase/detail-view/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { closeNavbar, setDetailView } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getMetadata } from "metabase/selectors/metadata";
import { extractRemappedColumns } from "metabase/visualizations";
import * as Lib from "metabase-lib";

interface Props {
  params: {
    tableId: string;
    rowId: string;
  };
}

export function TableDetailPage({ params }: Props) {
  const tableId = parseInt(params.tableId, 10);
  const rowId = params.rowId;

  const {
    data: table,
    error: tableError,
    isLoading: isTableLoading,
  } = useGetTableQueryMetadataQuery({ id: tableId });
  const { data: tableForeignKeys } = useListTableForeignKeysQuery(tableId);

  const metadata = useSelector(getMetadata);
  const tableQuery = useMemo(
    () => getTableQuery(metadata, table),
    [metadata, table],
  );
  const objectQuery = useMemo(() => {
    return tableQuery && table
      ? filterByPk(tableQuery, table.fields ?? [], rowId)
      : undefined;
  }, [rowId, table, tableQuery]);

  const {
    data: dataset,
    error: queryError,
    isLoading: isQueryLoading,
  } = useGetAdhocQueryQuery(
    objectQuery ? Lib.toJsQuery(objectQuery) : skipToken,
  );

  const error = tableError ?? queryError;
  const isLoading = isTableLoading || isQueryLoading;

  const data = useMemo(() => {
    return dataset ? extractRemappedColumns(dataset.data) : undefined;
  }, [dataset]);

  const columns = useMemo(() => data?.cols ?? [], [data]);
  const row = useMemo(() => (data?.rows ?? [])[0], [data]);
  const rowName = getRowName(columns, row) || rowId;

  const dispatch = useDispatch();
  const isNavBarOpen = useSelector(getIsNavbarOpen);

  useEffect(() => {
    dispatch(closeNavbar());
  }, [dispatch]);

  useEffect(() => {
    if (table) {
      dispatch(setDetailView({ rowName, table, collectionId: null }));
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
    <DetailViewPage
      columns={columns}
      isNavBarOpen={isNavBarOpen}
      row={row}
      rowId={rowId}
      table={table}
      tableForeignKeys={tableForeignKeys}
    />
  );
}
