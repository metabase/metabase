import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery, ParameterTarget } from "metabase-types/api";

export function normalize(query: DatasetQuery): DatasetQuery;
export function normalize<T extends ParameterTarget>(target: T): T;
export function normalize(query: unknown): unknown;
export function normalize(query: unknown): unknown {
  return ML.normalize(query);
}
