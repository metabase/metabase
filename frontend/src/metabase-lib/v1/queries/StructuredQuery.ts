import type { DatasetQuery } from "metabase-types/api";

export const STRUCTURED_QUERY_TEMPLATE = {
  database: null,
  type: "query",
  query: {
    "source-table": null,
  },
};

export class StructuredQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery) {
    return datasetQuery?.type === STRUCTURED_QUERY_TEMPLATE.type;
  }
}
