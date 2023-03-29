import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";
import type { Query } from "./types";

export function toLegacyQuery(query: Query): DatasetQuery {
  return ML.legacy_query(query);
}
