import Base from "./Base";
import Database from "./Database";
import Table from "./Table";

import { titleize, humanize } from "metabase/lib/formatting";

/**
 * Wrapper class for a {@link Database} schema. Contains {@link Table}s.
 */
export default class Schema extends Base {
  displayName() {
    return titleize(humanize(this.name));
  }

  /**
   * @private
   * @param {string} name
   * @param {Database} database
   * @param {Table[]} tables
   */
  _constructor(name, database, tables) {
    this.name = name;
    this.database = database;
    this.tables = tables;
  }
}
