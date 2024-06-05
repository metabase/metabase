import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import type { Card, TableId, UnsavedCard } from "metabase-types/api";
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
  (card: Card | UnsavedCard) => async (dispatch: Dispatch) => {
    if (isSavedCard(card)) {
      return dispatch(Questions.actions.fetchMetadata({ id: card.id }));
    } else if (card.dataset_query.database != null) {
      return dispatch(Questions.actions.fetchAdhocMetadata(card.dataset_query));
    }
  };
