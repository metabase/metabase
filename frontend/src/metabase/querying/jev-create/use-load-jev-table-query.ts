import { useCallback } from "react";
import _ from "underscore";

import { tableApi } from "metabase/api";
import { selectMetadataProvider } from "metabase/metadata-store";
import {
  type JevQuestionColumnsByKey,
  getJevQuestionColumns,
} from "metabase/querying/jev-filters/question-utils";
import { useDispatch, useStore } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { Table, TableId } from "metabase-types/api";

export interface JevTableQuery {
  query: Lib.Query;
  columnsByKey: JevQuestionColumnsByKey;
}

function getForeignTableIds(table: Table): TableId[] {
  return _.uniq(
    (table.fields ?? []).flatMap((field) =>
      field.target?.table_id != null ? [field.target.table_id] : [],
    ),
  );
}

/**
 * Loads a table's metadata, and its foreign tables' so implicitly joined columns
 * are there too, then builds a bare query on it with Jev's column keys.
 * Waiting for the foreign tables matters: the keys index the filterable columns,
 * which would shift if their metadata arrived later.
 */
export function useLoadJevTableQuery() {
  const dispatch = useDispatch();
  const store = useStore();

  return useCallback(
    async (tableId: TableId): Promise<JevTableQuery | null> => {
      const loadTable = (id: TableId) =>
        dispatch(
          tableApi.endpoints.getTableQueryMetadata.initiate(
            { id },
            { subscribe: false },
          ),
        ).unwrap();

      const table = await loadTable(tableId);
      await Promise.allSettled(getForeignTableIds(table).map(loadTable));

      const provider = selectMetadataProvider(store.getState(), table.db_id);
      const tableMetadata = Lib.tableOrCardMetadata(provider, tableId);
      if (tableMetadata == null) {
        return null;
      }
      const query = Lib.queryFromTableOrCardMetadata(provider, tableMetadata);
      return { query, columnsByKey: getJevQuestionColumns(query) };
    },
    [dispatch, store],
  );
}
