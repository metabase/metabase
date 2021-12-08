// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Base from "./Base";
/**
 * @typedef { import("./metadata").FilterClause } FilterClause
 */

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */

export default class Segment extends Base {
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
