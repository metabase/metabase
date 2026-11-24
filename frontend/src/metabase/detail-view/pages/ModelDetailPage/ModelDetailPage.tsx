import { useEffect, useMemo } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useGetCardQuery, useGetCardQueryMetadataQuery } from "metabase/api";
import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { DetailViewPage } from "metabase/detail-view/components";
import { filterByPk, getRowName } from "metabase/detail-view/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import { useDispatch, useSelector } from "metabase/redux";
import { setDetailView } from "metabase/redux/app";
import { useParams } from "metabase/router";
import { getIsNavbarOpen } from "metabase/selectors/app";
import * as Urls from "metabase/urls";
import { extractRemappedColumns } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import type { CardId } from "metabase-types/api";

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
    data: cardMetadata,
    error: metadataError,
    isLoading: isMetadataLoading,
  } = useGetCardQueryMetadataQuery(cardId == null ? skipToken : cardId);
  const metadataProvider = useMetadataProvider(card?.database_id ?? null);

  const objectQuery = useMemo(() => {
    if (card == null || cardMetadata == null) {
      return undefined;
    }
    const cardQuery = getCardQuery(metadataProvider, card.id);
    return cardQuery != null
      ? filterByPk(cardQuery, card.result_metadata ?? [], rowId)
      : undefined;
  }, [rowId, card, cardMetadata, metadataProvider]);

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

  const collectionId = card?.collection_id ?? null;
  const columns = useMemo(() => data?.cols ?? [], [data]);
  const row = useMemo(() => (data?.rows ?? [])[0], [data]);
  const rowName = getRowName(columns, row) || rowId;

  const dispatch = useDispatch();
  const isNavBarOpen = useSelector(getIsNavbarOpen);

  useEffect(() => {
    if (card) {
      dispatch(setDetailView({ type: "model", rowName, card, collectionId }));
    }
  }, [dispatch, rowName, card, collectionId]);

  useUnmount(() => {
    dispatch(setDetailView(null));
  });

  if (!card || !dataset || !row || error || isLoading) {
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
    />
  );
}

function getCardQuery(
  metadataProvider: Lib.MetadataProvider,
  cardId: CardId,
): Lib.Query | undefined {
  const cardMetadata = Lib.cardMetadata(metadataProvider, cardId);
  return cardMetadata != null
    ? Lib.queryFromTableOrCardMetadata(metadataProvider, cardMetadata)
    : undefined;
}
