// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {
  Database as IDatabase,
  DatabaseFeature,
  DatabaseSettings,
  NativePermissions,
  StructuredQuery,
} from "metabase-types/api";
import { generateSchemaId } from "metabase-lib/metadata/utils/schema";
import { createLookupByProperty, memoizeClass } from "metabase-lib/utils";
import Question from "../Question";
import Base from "./Base";
import Table from "./Table";
import Schema from "./Schema";
import Metadata from "./Metadata";

/**
 * @typedef { import("./Metadata").SchemaName } SchemaName
 */

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 *
 * Backed by types/Database data structure which matches the backend API contract
 */

class DatabaseInner extends Base {
  id: number;
  name: string;
  engine: string;
  description: string;
  creator_id?: number;
  is_sample: boolean;
  is_saved_questions: boolean;
  tables: Table[];
  schemas: Schema[];
  metadata: Metadata;
  features: DatabaseFeature[];
  details: Record<string, unknown>;
  settings?: DatabaseSettings;
  native_permissions: NativePermissions;

  // Only appears in  GET /api/database/:id
  "can-manage"?: boolean;

  getPlainObject(): IDatabase {
    return this._plainObject;
  }

  // TODO Atte Keinänen 6/11/17: List all fields here (currently only in types/Database)
  displayName() {
    return this.name;
  }

  // SCHEMAS

  /**
   * @param {SchemaName} [schemaName]
   */
  schema(schemaName) {
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
  tablesLookup() {
    return createLookupByProperty(this.tables, "id");
  }

  // @deprecated: use tablesLookup
  get tables_lookup() {
    return this.tablesLookup();
  }

  // FEATURES

  /**
   * @typedef {import("./Metadata").DatabaseFeature} DatabaseFeature
   * @typedef {"join"} VirtualDatabaseFeature
   * @param {DatabaseFeature | VirtualDatabaseFeature} [feature]
   */
  hasFeature(feature) {
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

  supportsExpressions() {
    return this.hasFeature("expressions");
  }

  canWrite() {
    return this.native_permissions === "write";
  }

  isPersisted() {
    return this.hasFeature("persist-models-enabled");
  }

  supportsPersistence() {
    return this.hasFeature("persist-models");
  }

  supportsActions() {
    return this.hasFeature("actions");
  }

  hasActionsEnabled() {
    return Boolean(this.settings?.["database-enable-actions"]);
  }

  // QUESTIONS
  newQuestion() {
    return this.question().setDefaultQuery().setDefaultDisplay();
  }

  question(
    query: StructuredQuery = {
      "source-table": null,
    },
  ) {
    return Question.create({
      metadata: this.metadata,
      dataset_query: {
        database: this.id,
        type: "query",
        query: query,
      },
    });
  }

  nativeQuestion(native = {}) {
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
  savedQuestionsDatabase() {
    return this.metadata.databasesList().find(db => db.is_saved_questions);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Database extends memoizeClass<DatabaseInner>(
  "tablesLookup",
)(DatabaseInner) {}
