// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Question from "../Question";
import Base from "./Base";
import { generateSchemaId } from "metabase/lib/schema";
import { createLookupByProperty, memoizeClass } from "metabase-lib/lib/utils";
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

class Database extends Base {
  id: number;
  name: string;
  description: string;
  tables: Table[];
  schemas: Schema[];
  metadata: Metadata;

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
   * @typedef {import("./metadata").DatabaseFeature} DatabaseFeature
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

  canWrite() {
    return this.native_permissions === "write";
  }

  isPersisted() {
    return this.hasFeature("persist-models-enabled");
  }

  supportsPersistence() {
    return this.hasFeature("persist-models");
  }

  // QUESTIONS
  newQuestion() {
    return this.question()
      .setDefaultQuery()
      .setDefaultDisplay();
  }

  question(
    query = {
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

  /**
   * @private
   * @param {number} id
   * @param {string} name
   * @param {?string} description
   * @param {Table[]} tables
   * @param {Schema[]} schemas
   * @param {Metadata} metadata
   * @param {boolean} auto_run_queries
   */

  /* istanbul ignore next */
  _constructor(
    id,
    name,
    description,
    tables,
    schemas,
    metadata,
    auto_run_queries,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.tables = tables;
    this.schemas = schemas;
    this.metadata = metadata;
    this.auto_run_queries = auto_run_queries;
  }
}

export default memoizeClass("tablesLookup")(Database);
