import { cardApi, datasetApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { Dispatch } from "metabase/redux/store";
import { fetchTableMetadata } from "metabase/redux/tables";
import type { Card, TableId, UnsavedCard } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import { isSavedCard } from "metabase-types/guards";

export const loadMetadataForTable =
  (tableId: TableId) => async (dispatch: Dispatch) => {
    try {
      await dispatch(fetchTableMetadata({ id: tableId }));
    } catch (error) {
      console.error("Error in loadMetadataForTable", error);
    }
  };

export const loadMetadataForCard =
  (
    card: Card | UnsavedCard,
    {
      token,
      includeSensitiveFields,
    }: { token?: EntityToken | null; includeSensitiveFields?: boolean } = {},
  ) =>
  async (dispatch: Dispatch) => {
    if (isSavedCard(card)) {
      return runRtkEndpoint(
        token ?? card.id,
        dispatch,
        cardApi.endpoints.getCardQueryMetadata,
        { forceRefetch: false },
      );
    } else if (card.dataset_query.database != null) {
      return runRtkEndpoint(
        {
          ...card.dataset_query,
          ...(!!token && { token }),
          ...(includeSensitiveFields && {
            settings: { include_sensitive_fields: true },
          }),
        },
        dispatch,
        datasetApi.endpoints.getAdhocQueryMetadata,
        { forceRefetch: false },
      );
    }
  };
