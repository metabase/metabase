/* @flow weak */

import Question from "../Question";

import Base from "./Base";
import Table from "./Table";
import Schema from "./Schema";

import _ from "underscore";

import type { SchemaName } from "metabase/meta/types/Table";
import type { DatabaseFeature } from "metabase/meta/types/Database";

type VirtualDatabaseFeature = "join";

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 *
 * Backed by types/Database data structure which matches the backend API contract
 */
export default class Database extends Base {
  // TODO Atte Keinänen 6/11/17: List all fields here (currently only in types/Database)

  name: string;
  description: ?string;

  tables: Table[];
  schemas: Schema[];

  displayName(): string {
    return this.name;
  }

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

  hasFeature(feature: DatabaseFeature | VirtualDatabaseFeature): boolean {
    const set = new Set(this.features);
    if (feature === "join") {
      return (
        set.has("left-join") ||
        set.has("right-join") ||
        set.has("inner-join") ||
        set.has("full-join")
      );
    } else {
      return set.has(feature);
    }
  }

  newQuestion(): Question {
    // $FlowFixMe
    return Question.create({ database: this, metadata: this.metadata });
  }
}
