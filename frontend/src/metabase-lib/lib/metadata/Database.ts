import Question from "../Question";
import Base from "./Base";
import { generateSchemaId } from "metabase/lib/schema";
import { memoize, createLookupByProperty } from "metabase-lib/lib/utils";
import { StructuredQuery, NativeQuery } from "metabase-types/types/Query";
import Table from "./Table";
import Schema from "./Schema";
import Metadata from "./Metadata";
/**
 * @typedef { import("./metadata").SchemaName } SchemaName
 */

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 *
 * Backed by types/Database data structure which matches the backend API contract
 */

export default class Database extends Base {
  id!: number;
  name!: string;
  description!: string | null;
  tables!: Table[];
  schemas!: Schema[];
  metadata!: Metadata;
  features!: string[];
  native_permissions!: string;
  auto_run_queries!: boolean;

  // TODO Atte Keinänen 6/11/17: List all fields here (currently only in types/Database)
  displayName() {
    return this.name;
  }

  // SCHEMAS

  /**
   * @param {SchemaName} [schemaName]
   */
  schema(schemaName: string | undefined | null): Schema | undefined {
    if (!schemaName) {
      return undefined;
    }

    return this.metadata.schema(generateSchemaId(this.id, schemaName));
  }

  schemaNames() {
    return this.schemas.map(s => s.name).sort((a, b) => a.localeCompare(b));
  }

  getSchemas() {
    return this.schemas;
  }

  schemasCount() {
    return this.schemas.length;
  }

  getTables() {
    return this.tables;
  }

  // TABLES
  @memoize
  tablesLookup(): Record<Table["id"], Table> {
    return createLookupByProperty(this.tables, "id");
  }

  // @deprecated: use tablesLookup
  get tables_lookup() {
    return this.tablesLookup();
  }

  // FEATURES

  /**
   * @typedef {import("./metadata").DatabaseFeature} DatabaseFeature
   * @typedef {"join"} VirtualDatabaseFeature
   * @param {DatabaseFeature | VirtualDatabaseFeature} [feature]
   */
  hasFeature(feature: string | undefined | null) {
    if (!feature) {
      return true;
    }

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

  supportsPivots() {
    return this.hasFeature("expressions") && this.hasFeature("left-join");
  }

  canWrite() {
    return this.native_permissions === "write";
  }

  // QUESTIONS
  newQuestion(): Question {
    return this.question({})
      .setDefaultQuery()
      .setDefaultDisplay();
  }

  question(query: StructuredQuery): Question {
    return Question.create({
      metadata: this.metadata,
      dataset_query: {
        database: this.id,
        type: "query",
        query: query,
      },
    });
  }

  nativeQuestion(native: NativeQuery): Question {
    return Question.create({
      metadata: this.metadata,
      dataset_query: {
        database: this.id,
        type: "native",
        native: {
          ...native,
        },
      },
    });
  }

  /** Returns a database containing only the saved questions from the same database, if any */
  savedQuestionsDatabase(): Database | undefined {
    return this.metadata.databasesList().find(db => db.is_saved_questions);
  }
}
