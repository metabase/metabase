import { legacy_query } from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";
import type { Query } from "./types";

export function toLegacyQuery(query: Query): DatasetQuery {
  return legacy_query(query);
}
