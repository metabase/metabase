// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Filter from "metabase-lib/queries/structured/Filter";
import Base from "./Base";
/**
 * @typedef { import("./Metadata").Aggregation } Aggregation
 */

/**
 * Wrapper class for a metric. Belongs to a {@link Database} and possibly a {@link Table}
 */

export default class Metric extends Base {
  name: string;

  displayName() {
    return this.name;
  }

  /**
   * @returns {Aggregation}
   */
  aggregationClause() {
    return ["metric", this.id];
  }

  /** Underlying query for this metric */
  definitionQuery() {
    return this.definition
      ? this.table.query().setQuery(this.definition)
      : null;
  }

  /** Underlying filter clauses for this metric */
  filters(): Filter[] {
    const query = this.definitionQuery();
    return query ? query.filters() : [];
  }

  /** Underlying aggregation clause for this metric */
  aggregation() {
    const query = this.definitionQuery();
    return query?.aggregations()[0];
  }

  /** Column name when this metric is used in a query */
  columnName() {
    const aggregation = this.aggregation();

    if (aggregation) {
      return aggregation.columnName();
    } else if (typeof this.id === "string") {
      // special case for Google Analytics metrics
      return this.id;
    } else {
      return null;
    }
  }

  isActive() {
    return !this.archived;
  }

  /**
   * @private
   * @param {string} name
   * @param {string} description
   * @param {Database} database
   * @param {Table} table
   * @param {number} id
   * @param {StructuredQuery} definition
   * @param {boolean} archived
   */

  /* istanbul ignore next */
  _constructor(name, description, database, table, id, definition, archived) {
    this.name = name;
    this.description = description;
    this.database = database;
    this.table = table;
    this.id = id;
    this.definition = definition;
    this.archived = archived;
  }
}
