import { cardApi, datasetApi } from "metabase/api";
import { Tables } from "metabase/entities/tables";
import { entityCompatibleQuery } from "metabase/lib/entities";
import type { Card, TableId, UnsavedCard } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import { isSavedCard } from "metabase-types/guards";
import type { Dispatch } from "metabase-types/store";

export const loadMetadataForTable =
  (tableId: TableId) => async (dispatch: Dispatch) => {
    try {
      await dispatch(Tables.actions.fetchMetadata({ id: tableId }));
    } catch (error) {
      console.error("Error in loadMetadataForTable", error);
    }
  };

export const loadMetadataForCard =
  (card: Card | UnsavedCard, { token }: { token?: EntityToken | null } = {}) =>
  async (dispatch: Dispatch) => {
    if (isSavedCard(card)) {
      return entityCompatibleQuery(
        token ?? card.id,
        dispatch,
        cardApi.endpoints.getCardQueryMetadata,
        { forceRefetch: false },
      );
    } else if (card.dataset_query.database != null) {
      return entityCompatibleQuery(
        {
          ...card.dataset_query,
          ...(!!token && { token }),
        },
        dispatch,
        datasetApi.endpoints.getAdhocQueryMetadata,
        { forceRefetch: false },
      );
    }
  };
