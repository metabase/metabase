// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Base from "./Base";
import type Metadata from "./Metadata";
import type Table from "./Table";
/**
 * @typedef { import("./Metadata").FilterClause } FilterClause
 */

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */

export default class Segment extends Base {
  id: number;
  name: string;
  table_id: Table["id"];
  table: Table;
  metadata: Metadata;

  displayName() {
    return this.name;
  }

  /**
   * @returns {FilterClause}
   */
  filterClause() {
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

  /* istanbul ignore next */
  _constructor(name, description, database, table, id, archived) {
    this.name = name;
    this.description = description;
    this.database = database;
    this.table = table;
    this.id = id;
    this.archived = archived;
  }
}
