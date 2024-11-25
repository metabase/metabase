import type { DatasetQuery } from "metabase-types/api";

import type Question from "../Question";

import AtomicQuery from "./AtomicQuery";

export const STRUCTURED_QUERY_TEMPLATE = {
  database: null,
  type: "query",
  query: {
    "source-table": null,
  },
};

/**
 * A wrapper around an MBQL (`query` type @type {DatasetQuery}) object
 */

class StructuredQuery extends AtomicQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery) {
    return datasetQuery?.type === STRUCTURED_QUERY_TEMPLATE.type;
  }

  /**
   * Creates a new StructuredQuery based on the provided DatasetQuery object
   */
  constructor(question: Question, datasetQuery: DatasetQuery) {
    super(question, datasetQuery);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StructuredQuery;
