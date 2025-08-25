import { useEffect, useMemo } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useGetCardQueryMetadataQuery } from "metabase/api";
import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { DetailViewPage } from "metabase/detail-view/components";
import {
  filterByPk,
  getRowName,
  getTableQuery,
} from "metabase/detail-view/utils";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeNavbar, setDetailView } from "metabase/redux/app";
import { extractRemappedColumns } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";

interface Props {
  params: {
    slug: string;
    rowId: string;
  };
}

export function ModelDetailPage({ params }: Props) {
  const cardId = Urls.extractEntityId(params.slug);
  const rowId = params.rowId;

  const {
    data: metadata,
    error: metadataError,
    isLoading: isMetadataLoading,
  } = useGetCardQueryMetadataQuery(cardId == null ? skipToken : cardId);

  const table = metadata?.tables?.find(
    (table) => table.id === getQuestionVirtualTableId(cardId),
  );

  const tableQuery = useMemo(() => getTableQuery(table), [table]);
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
    objectQuery ? Lib.toLegacyQuery(objectQuery) : skipToken,
  );

  const error = metadataError ?? queryError;
  const isLoading = isMetadataLoading || isQueryLoading;

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
    <DetailViewPage columns={columns} row={row} rowId={rowId} table={table} />
  );
}
