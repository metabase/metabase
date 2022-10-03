import { SegmentFilter } from "metabase-types/types/Query";
import Base from "../Base";
import Database from "../Database";
import Table from "../Table";
import { SegmentProps } from "./types";

/**
 * @typedef { import("./metadata").FilterClause } FilterClause
 */

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */

export default class Segment extends Base {
  name: string;
  description: string;
  database: Database;
  table: Table;
  id: number;
  archived: boolean;

  /**
   * @private
   * @param {string} name
   * @param {string} description
   * @param {Database} database
   * @param {Table} table
   * @param {number} id
   * @param {boolean} archived
   */
  constructor(object: SegmentProps) {
    super(object);

    const { name, description, database, table, id, archived } = object;
    this.name = name;
    this.description = description;
    this.database = database;
    this.table = table;
    this.id = id;
    this.archived = archived;
  }

  /**
   * @returns {FilterClause}
   */
  filterClause(): SegmentFilter {
    return ["segment", this.id];
  }

  isActive(): boolean {
    return !this.archived;
  }
}
