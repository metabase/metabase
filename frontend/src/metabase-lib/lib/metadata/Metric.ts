import Base from "./Base";
import { MetricId } from "metabase-types/types/Metric";
import {
  StructuredQuery as StructuredQueryType,
  MetricAgg,
} from "metabase-types/types/Query";
import Table from "./Table";
import Database from "./Database";
import Aggregation from "../queries/structured/Aggregation";
import StructuredQuery from "../queries/StructuredQuery";

/**
 * @typedef { import("./metadata").Aggregation } Aggregation
 */

/**
 * Wrapper class for a metric. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Metric extends Base {
  id!: MetricId;
  name!: string;
  description!: string;
  definition!: StructuredQueryType;
  table!: Table;
  database!: Database;
  archived!: boolean;

  displayName() {
    return this.name;
  }

  aggregationClause(): MetricAgg {
    return ["metric", this.id];
  }

  definitionQuery(): StructuredQuery | null {
    return this.definition
      ? this.table.query().setQuery(this.definition)
      : null;
  }

  /** Underlying aggregation clause for this metric */
  aggregation(): Aggregation | undefined {
    const query = this.definitionQuery();

    if (query) {
      return query.aggregations()[0];
    }
  }

  /** Column name when this metric is used in a query */
  columnName(): string | null {
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
}
