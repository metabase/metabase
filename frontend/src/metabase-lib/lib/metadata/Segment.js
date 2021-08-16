import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import type { FilterClause } from "metabase-types/types/Query";

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Segment extends Base {
  displayName(): string {
    return this.name;
  }

  filterClause(): FilterClause {
    return ["segment", this.id];
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
   * @param {boolean} archived
   */
  _constructor(name, description, database, table, id, archived) {
    this.name = name;
    this.description = description;
    this.database = database;
    this.table = table;
    this.id = id;
    this.archived = archived;
  }
}
