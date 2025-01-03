// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Represents a structured MBQL query.
 */
import _ from "underscore";

import * as Lib from "metabase-lib";
import type {
  DatasetQuery,
  StructuredDatasetQuery,
  TableId,
} from "metabase-types/api";

import type { Query } from "../../types";
import type Question from "../Question";
import type Table from "../metadata/Table";

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

  // For Flow type completion
  _structuredDatasetQuery: StructuredDatasetQuery;

  /**
   * Creates a new StructuredQuery based on the provided DatasetQuery object
   */
  constructor(
    question: Question,
    datasetQuery: DatasetQuery = STRUCTURED_QUERY_TEMPLATE,
  ) {
    super(question, datasetQuery);
    this._structuredDatasetQuery = datasetQuery as StructuredDatasetQuery;
  }

  private getMLv2Query(): Query {
    return this.question().query();
  }

  /**
   * @returns the underlying MBQL query object
   */
  legacyQuery(): StructuredQueryObject {
    return this._structuredDatasetQuery.query;
  }

  /**
   * @returns the table ID, if a table is selected.
   * @deprecated Use MLv2
   */
  private _sourceTableId(): TableId | null | undefined {
    const query = this.getMLv2Query();
    const sourceTableId = Lib.sourceTableOrCardId(query);
    return sourceTableId;
  }

  /**
   * @returns the table object, if a table is selected and loaded.
   */
  table = _.once((): Table | null => {
    const question = this.question();
    const metadata = question.metadata();
    return metadata.table(this._sourceTableId());
  });
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StructuredQuery;
