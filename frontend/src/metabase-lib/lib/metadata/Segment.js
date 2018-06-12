/* @flow weak */

import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import type { FilterClause } from "metabase/meta/types/Query";

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Segment extends Base {
  displayName: string;
  description: string;

  database: Database;
  table: Table;

  filterClause(): FilterClause {
    return ["SEGMENT", this.id];
  }

  isActive(): boolean {
    return !this.archived;
  }
}
