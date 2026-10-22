import { createSelector } from "@reduxjs/toolkit";

import { selectMetadataProvider } from "metabase/metadata-store";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TableId } from "metabase-types/api";

/**
 * The segment's definition as a query. The database comes from the definition,
 * so the provider is selected for it rather than looked up at build time.
 */
export const getSegmentQuery = createSelector(
  [
    (state: State, query: DatasetQuery | undefined) =>
      selectMetadataProvider(state, query?.database ?? null),
    (_state: State, query: DatasetQuery | undefined) => query,
    (_state: State, _query: DatasetQuery | undefined, tableId?: TableId) =>
      tableId,
  ],
  (metadataProvider, query, tableId) => {
    if (!query) {
      return undefined;
    }

    const databaseId = query.database;

    if (!databaseId) {
      console.error("No database ID found in segment definition:", {
        query,
        tableId,
      });
      return undefined;
    }

    return Lib.fromJsQuery(metadataProvider, query);
  },
);

export function getSegmentQueryDefinition(query: Lib.Query) {
  // Return the full MBQL5 query like Question.setQuery() does
  return Lib.toJsQuery(query);
}
