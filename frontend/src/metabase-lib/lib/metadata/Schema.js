/* @flow weak */

import Base from "./Base";
import Database from "./Database";
import Table from "./Table";

import { titleize, humanize } from "metabase/lib/formatting";

/**
 * Wrapper class for a {@link Database} schema. Contains {@link Table}s.
 */
export default class Schema extends Base {
  database: Database;
  tables: Table[];

  displayName() {
    return titleize(humanize(this.name));
  }
}
