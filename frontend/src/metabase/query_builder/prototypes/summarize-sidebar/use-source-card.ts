import { useEffect, useState } from "react";

import { selectTableQueryMetadata } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import {
  selectMetadataProvider,
  selectQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch, useStore } from "metabase/redux";
import { fetchTableMetadata } from "metabase/redux/tables";
import * as Lib from "metabase-lib";
import type { Card, TableId } from "metabase-types/api";

export type SourceCardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; card: Card; sourceName: string };

/** A raw, unsummarized question over the table or saved question `sourceId`, as the query builder opens it. */
export function useSourceCard(sourceId: TableId): SourceCardState {
  const dispatch = useDispatch();
  const store = useStore();
  const [state, setState] = useState<SourceCardState>({ status: "loading" });

  useEffect(() => {
    let isCancelled = false;
    setState({ status: "loading" });

    const load = async () => {
      await dispatch(fetchTableMetadata({ id: sourceId }));
      const appState = store.getState();
      const { data: tableMetadata, error } = selectTableQueryMetadata({
        id: sourceId,
      })(appState);
      if (tableMetadata == null) {
        throw error ?? new Error(`Couldn't load ${sourceId}`);
      }
      const metadataProvider = selectMetadataProvider(
        appState,
        tableMetadata.db_id,
      );
      const table = Lib.tableOrCardMetadata(metadataProvider, sourceId);
      if (table == null) {
        throw new Error(`Couldn't load ${sourceId}`);
      }
      const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
      const card = selectQuestionFromOptsBuilder(appState)({
        dataset_query: Lib.toJsQuery(query),
        display: "table",
      }).card();
      const { displayName } = Lib.displayInfo(query, -1, table);
      // the query builder opens with the metadata of every table the query can reach (e.g. through FKs)
      await dispatch(loadMetadataForCard(card));
      return { card, sourceName: displayName };
    };

    load().then(
      ({ card, sourceName }) => {
        if (!isCancelled) {
          setState({ status: "loaded", card, sourceName });
        }
      },
      (error: unknown) => {
        if (!isCancelled) {
          setState({ status: "error", message: getErrorMessage(error) });
        }
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [dispatch, store, sourceId]);

  return state;
}
