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

  auto_run_queries: boolean;

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
    return this.question()
      .setDefaultQuery()
      .setDefaultDisplay();
  }

  question(query = { "source-table": null }): Question {
    return Question.create({
      metadata: this.metadata,
      dataset_query: {
        database: this.id,
        type: "query",
        query: query,
      },
    });
  }

  nativeQuestion(native = {}): Question {
    return Question.create({
      metadata: this.metadata,
      dataset_query: {
        database: this.id,
        type: "native",
        native: {
          query: "",
          "template-tags": {},
          ...native,
        },
      },
    });
  }

  nativeQuery(native) {
    return this.nativeQuestion(native).query();
  }

  /** Returns a database containing only the saved questions from the same database, if any */
  savedQuestionsDatabase(): ?Database {
    const database = this.metadata
      .databasesList()
      .find(db => db.is_saved_questions);
    if (database) {
      const tables = database.tables.filter(t => t.db_id === this.id);
      if (tables.length > 0) {
        return new Database({ ...database, tables });
      }
    }
    return null;
  }
}
