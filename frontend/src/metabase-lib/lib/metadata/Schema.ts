import Base from "./Base";
import { titleize, humanize } from "metabase/lib/formatting";
import Database from "./Database";
import Table from "./Table";
/**
 * Wrapper class for a {@link Database} schema. Contains {@link Table}s.
 */

export default class Schema extends Base {
  id!: string;
  name!: string;
  database!: Database;
  tables!: Table[];

  displayName() {
    return titleize(humanize(this.name));
  }

  getTables() {
    return this.tables;
  }
}
