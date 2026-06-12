import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";

export function normalize(query: DatasetQuery): DatasetQuery;
export function normalize(query: unknown): unknown;
export function normalize(query: unknown): unknown {
  return ML.normalize(query);
}
