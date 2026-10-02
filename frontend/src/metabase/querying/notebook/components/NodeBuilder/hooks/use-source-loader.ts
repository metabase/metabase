import { useCallback } from "react";

import { datasetApi, selectTableQueryMetadata } from "metabase/api";
import { selectMetadataProvider } from "metabase/metadata-store";
import { useDispatch, useStore } from "metabase/redux";
import { fetchTableMetadata } from "metabase/redux/tables";
import * as Lib from "metabase-lib";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, DatasetQuery, TableId } from "metabase-types/api";

import { type PickedTable, describeTable } from "../graph";

// Loads the metadata behind a picked table, model or saved question and
// describes it for its block.
export function useSourceLoader() {
  const store = useStore();
  const dispatch = useDispatch();

  return useCallback(
    async (tableId: TableId, databaseId: DatabaseId): Promise<PickedTable> => {
      // A model or saved question comes with its result columns through the
      // same call the query builder makes for an ad-hoc question on it.
      if (isVirtualCardId(tableId)) {
        const datasetQuery: DatasetQuery = {
          database: databaseId,
          type: "query",
          query: { "source-table": tableId },
        };
        await dispatch(
          datasetApi.endpoints.getAdhocQueryMetadata.initiate(datasetQuery, {
            forceRefetch: false,
          }),
        ).unwrap();
        const provider = selectMetadataProvider(store.getState(), databaseId);
        const card = Lib.tableOrCardMetadata(provider, tableId);
        if (!card) {
          throw new Error(`Card ${tableId} is missing from the provider`);
        }
        return describeTable(provider, card, databaseId);
      }
      await dispatch(fetchTableMetadata({ id: tableId }));
      const state = store.getState();
      const { data: tableMetadata } = selectTableQueryMetadata({
        id: tableId,
      })(state);
      if (!tableMetadata) {
        throw new Error(`No metadata loaded for table ${tableId}`);
      }
      const provider = selectMetadataProvider(state, tableMetadata.db_id);
      const table = Lib.tableOrCardMetadata(provider, tableId);
      if (!table) {
        throw new Error(`Table ${tableId} is missing from the provider`);
      }
      return describeTable(provider, table, tableMetadata.db_id);
    },
    [dispatch, store],
  );
}
