// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import AtomicQuery from "metabase-lib/queries/AtomicQuery";
import type { DatasetQuery } from "metabase-types/api";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class InternalQuery extends AtomicQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery) {
    return datasetQuery?.type === "internal";
  }
}
