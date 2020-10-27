/* @flow weak */

import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import type { FilterClause } from "metabase-types/types/Query";

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Segment extends Base {
  name: string;
  description: string;

  database: Database;
  table: Table;

  displayName(): string {
    return this.name;
  }

  filterClause(): FilterClause {
    return ["segment", this.id];
  }

  isActive(): boolean {
    return !this.archived;
  }
}
