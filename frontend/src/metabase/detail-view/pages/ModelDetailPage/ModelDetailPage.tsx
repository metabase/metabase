import { useMemo } from "react";
import { t } from "ttag";

import { useGetCardQuery, useGetCardQueryMetadataQuery } from "metabase/api";
import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { useHeaderCollection } from "metabase/common/hooks/use-header-collection";
import { DetailViewPage } from "metabase/detail-view/components";
import { filterByPk, getTableQuery } from "metabase/detail-view/utils";
import { useSelector } from "metabase/redux";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { extractRemappedColumns } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";

type ModelDetailPageParams = {
  slug: string;
  rowId: string;
};

export function ModelDetailPage() {
  const { slug, rowId = "" } = useParams<ModelDetailPageParams>();
  const cardId = Urls.extractEntityId(slug);

  const {
    data: card,
    error: cardError,
    isLoading: isCardLoading,
  } = useGetCardQuery(cardId == null ? skipToken : { id: cardId });

  const {
    data: queryMetadata,
    error: metadataError,
    isLoading: isMetadataLoading,
  } = useGetCardQueryMetadataQuery(cardId == null ? skipToken : cardId);

  const virtualTableId =
    cardId == null ? undefined : getQuestionVirtualTableId(cardId);
  const table =
    virtualTableId != null
      ? queryMetadata?.tables?.find((table) => table.id === virtualTableId)
      : undefined;
  const tableQuery = useSelector((state) => getTableQuery(state, table));
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

  const error = metadataError ?? queryError ?? cardError;
  const isLoading = isMetadataLoading || isQueryLoading || isCardLoading;

  const data = useMemo(() => {
    return dataset ? extractRemappedColumns(dataset.data) : undefined;
  }, [dataset]);

  const columns = useMemo(() => data?.cols ?? [], [data]);
  const row = useMemo(() => (data?.rows ?? [])[0], [data]);

  useHeaderCollection(card?.collection_id);

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
