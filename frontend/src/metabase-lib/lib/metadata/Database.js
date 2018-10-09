/* @flow weak */

import Question from "../Question";

import Base from "./Base";
import Table from "./Table";
import Schema from "./Schema";

import _ from "underscore";

import type { SchemaName } from "metabase/meta/types/Table";

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 *
 * Backed by types/Database data structure which matches the backend API contract
 */
export default class Database extends Base {
  // TODO Atte Keinänen 6/11/17: List all fields here (currently only in types/Database)

  displayName: string;
  description: ?string;

  tables: Table[];
  schemas: Schema[];

  tablesInSchema(schemaName: ?SchemaName) {
    return this.tables.filter(table => table.schema === schemaName);
  }

  schemaNames(): Array<SchemaName> {
    return _.uniq(
      this.tables
        .map(table => table.schema)
        .filter(schemaName => schemaName != null),
    );
  }

  newQuestion(): Question {
    // $FlowFixMe
    return new Question();
  }
}
