import * as ML from "cljs/metabase.lib.js";

import type { Query } from "./types";

/**
 * Get the Database ID (`:database`) associated with a query. If the query is using
 * the Saved Questions Virtual Database ID (used in some situations for queries starting from a Saved Question or Model)
 * we will attempt to resolve the correct Database ID by getting metadata for the source Card and returning its
 * `database_id`; if this is not available for one reason or another this will return `null`.
 */
export function databaseID(query: Query): number | null {
  return ML.database_id(query);
}
