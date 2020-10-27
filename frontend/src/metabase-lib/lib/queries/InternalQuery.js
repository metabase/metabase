/* @flow weak */

import type { DatasetQuery } from "metabase-types/types/Card";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

// Internal queries call Clojure functions in the backend rather than querying a
// datastore. Here's an example query:
// {
//  type: "internal",
//  fn: "function goes here",
//  args: [],
// }
export default class InternalQuery extends AtomicQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery): boolean {
    return datasetQuery.type === "internal";
  }
}
