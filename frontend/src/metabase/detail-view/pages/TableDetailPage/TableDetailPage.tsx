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
import { getObjectQuery, getRowName } from "metabase/detail-view/utils";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar, setDetailView } from "metabase/redux/app";
import { extractRemappedColumns } from "metabase/visualizations";
import type { StructuredDatasetQuery } from "metabase-types/api";

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

  const columns = useMemo(() => data?.cols ?? [], [data]);
  const row = useMemo(() => (data?.rows ?? [])[0], [data]);
  const rowName = getRowName(columns, row) || rowId;

  const dispatch = useDispatch();

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
    <DetailViewPage
      columns={columns}
      row={row}
      rowId={rowId}
      table={table}
      tableForeignKeys={tableForeignKeys}
    />
  );
}
