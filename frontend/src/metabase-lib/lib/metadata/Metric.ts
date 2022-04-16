import {
  StructuredQuery as StructuredQueryType,
  MetricAgg,
} from "metabase-types/types/Query";

import Aggregation from "../queries/structured/Aggregation";
import StructuredQuery from "../queries/StructuredQuery";
import Table from "./Table";
import Database from "./Database";
import Metadata from "./Metadata";

export interface IMetric {
  name: string;
  id: number | string;
  table_id: number;
  archived: boolean;
  description: string;
  definition: StructuredQueryType;
}

export type HydratedMetricProperties = {
  table: Table;
  database: Database;
};

export default class Metric {
  name: string;
  id: number | string;
  table_id: number;
  archived: boolean;
  description: string;
  definition: StructuredQueryType;

  table: Table | null;
  metadata: Metadata | null;

  _plainObject: IMetric;

  constructor(metric: IMetric) {
    this.name = metric.name;
    this.id = metric.id;
    this.table_id = metric.table_id;
    this.archived = metric.archived;
    this.description = metric.description;
    this.definition = metric.definition;

    // these properties are hydrated after instantiation in metabase/selectors/metadata
    this.table = null;
    this.metadata = null;

    Object.assign(this, metric);

    this._plainObject = { ...metric };
  }

  getPlainObject() {
    return this._plainObject;
  }

  displayName() {
    return this.name;
  }

  aggregationClause(): MetricAgg {
    return ["metric", this.id];
  }

  /** Underlying query for this metric */
  definitionQuery(): StructuredQuery | null {
    return this.table && this.definition
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
