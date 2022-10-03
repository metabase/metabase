import { MetricAgg } from "metabase-types/types/Query";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Aggregation from "metabase-lib/lib/queries/structured/Aggregation";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Base from "../Base";
import Database from "../Database";
import Table from "../Table";
import { MetricProps } from "./types";

/**
 * @typedef { import("./metadata").Aggregation } Aggregation
 */

/**
 * Wrapper class for a metric. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Metric extends Base {
  name: string;
  description: string;
  database: Database;
  table: Table;
  id: number;
  definition: string;
  archived: boolean;

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
  constructor(object: MetricProps) {
    super(object);

    const { name, description, database, table, id, definition, archived } =
      object;
    this.name = name;
    this.description = description;
    this.database = database;
    this.table = table;
    this.id = id;
    this.definition = definition;
    this.archived = archived;
  }

  /**
   * @returns {Aggregation}
   */
  aggregationClause(): MetricAgg {
    return ["metric", this.id];
  }

  /** Underlying query for this metric */
  definitionQuery(): StructuredQuery | null {
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
  aggregation(): Aggregation | undefined {
    const query = this.definitionQuery();
    return query?.aggregations()[0];
  }

  /** Column name when this metric is used in a query */
  columnName(): string | null {
    const aggregation = this.aggregation();
    if (aggregation) {
      return aggregation.columnName();
    }
    // special case for Google Analytics metrics
    else if (typeof this.id === "string") {
      return this.id;
    }

    return null;
  }

  isActive(): boolean {
    return !this.archived;
  }
}
