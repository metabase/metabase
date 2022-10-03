import { titleize, humanize } from "metabase/lib/formatting";
import Base from "../Base";
import type Database from "../Database";
import type Table from "../Table";
import { SchemaProps } from "./types";

/**
 * Wrapper class for a {@link Database} schema. Contains {@link Table}s.
 */
export default class Schema extends Base {
  id?: string;
  name: string;
  database: Database;
  tables: Table[];

  /**
   * @private
   * @param {string} name
   * @param {Database} database
   * @param {Table[]} tables
   */
  constructor(object: SchemaProps) {
    super(object);

    const { id, name, database, tables } = object;
    this.id = id;
    this.name = name;
    this.database = database;
    this.tables = tables;
  }

  displayName() {
    return titleize(humanize(this.name));
  }

  getTables(): Table[] {
    return this.tables;
  }
}
