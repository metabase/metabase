import { createSelector } from "@reduxjs/toolkit";

import { selectMetadataProviderFactory } from "metabase/metadata-store";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TableId } from "metabase-types/api";

/**
 * The segment's definition as a query. The database is only known from the
 * definition itself, which is why this reaches for the provider factory rather
 * than a provider.
 */
export const getSegmentQuery = createSelector(
  [
    selectMetadataProviderFactory,
    (_state: State, query: DatasetQuery | undefined) => query,
    (_state: State, _query: DatasetQuery | undefined, tableId?: TableId) =>
      tableId,
  ],
  (getMetadataProvider, query, tableId) => {
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

    return Lib.fromJsQuery(getMetadataProvider(databaseId), query);
  },
);

export function getSegmentQueryDefinition(query: Lib.Query) {
  // Return the full MBQL5 query like Question.setQuery() does
  return Lib.toJsQuery(query);
}
