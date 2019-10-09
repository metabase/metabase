/* @flow weak */

import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import type { Aggregation } from "metabase/meta/types/Query";

/**
 * Wrapper class for a metric. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Metric extends Base {
  name: string;
  description: string;

  database: Database;
  table: Table;

  displayName(): string {
    return this.name;
  }

  aggregationClause(): Aggregation {
    return ["metric", this.id];
  }

  definitionQuery() {
    return this.table.query().setQuery(this.definition);
  }

  aggregation() {
    return this.definitionQuery().aggregations()[0];
  }

  isActive(): boolean {
    return !this.archived;
  }
}
