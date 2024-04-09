import type Filter from "metabase-lib/v1/queries/structured/Filter";
import type { Aggregation, NormalizedMetric } from "metabase-types/api";

import type Metadata from "./Metadata";
import type Table from "./Table";

interface Metric extends Omit<NormalizedMetric, "table"> {
  table?: Table;
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Metric {
  private readonly _plainObject: NormalizedMetric;

  constructor(metric: NormalizedMetric) {
    this._plainObject = metric;
    Object.assign(this, metric);
  }

  getPlainObject() {
    return this._plainObject;
  }

  displayName() {
    return this.name;
  }

  aggregationClause(): Aggregation {
    return ["metric", this.id];
  }

  /** Underlying query for this metric */
  definitionQuery() {
    return this.table && this.definition
      ? this.table
          .legacyQuery({ useStructuredQuery: true })
          .setQuery(this.definition)
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Metric;
