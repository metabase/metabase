import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

/**
 * `/api/dataset/native` body for a Lib query, with the default row cap off.
 */
export const nativeCompileRequest = (query: Lib.Query): DatasetQuery => {
  const jsQuery: unknown = Lib.toJsQuery(query);
  if (typeof jsQuery !== "object" || jsQuery === null) {
    throw new Error("Lib.toJsQuery did not return an object");
  }
  // OpaqueDatasetQuery is branded unknown. The QP reads `middleware` off the
  // same query map `toJsQuery` produces; NativeDatasetQuery omits that key.
  return Object.assign(jsQuery, {
    middleware: { "disable-max-results?": true },
  }) as unknown as DatasetQuery;
};
