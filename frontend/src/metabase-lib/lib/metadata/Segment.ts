import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import { SegmentFilter } from "metabase-types/types/Query";

/**
 * @typedef { import("./metadata").FilterClause } FilterClause
 */

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Segment extends Base {
  id!: number;
  name!: string;
  description!: string;
  database!: Database;
  table!: Table;
  archived!: boolean;

  displayName() {
    return this.name;
  }

  filterClause(): SegmentFilter {
    return ["segment", this.id];
  }

  isActive() {
    return !this.archived;
  }
}
