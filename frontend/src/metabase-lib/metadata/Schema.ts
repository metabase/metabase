// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { titleize, humanize } from "metabase/lib/formatting";
import Base from "./Base";
import type Metadata from "./Metadata";
import type Database from "./Database";
import type Table from "./Table";
/**
 * Wrapper class for a {@link Database} schema. Contains {@link Table}s.
 */

export default class Schema extends Base {
  id: string;
  name: string;
  database: Database;
  tables: Table[];
  metadata: Metadata;

  displayName() {
    return this.name ? titleize(humanize(this.name)) : null;
  }

  getTables() {
    return this.tables;
  }

  /**
   * @private
   * @param {string} name
   * @param {Database} database
   * @param {Table[]} tables
   */

  /* istanbul ignore next */
  _constructor(name, database, tables) {
    this.name = name;
    this.database = database;
    this.tables = tables;
  }
}
