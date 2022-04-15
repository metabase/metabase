import Question from "../Question";
import { generateSchemaId } from "metabase/lib/schema";
import { memoize, createLookupByProperty } from "metabase-lib/lib/utils";
import { StructuredQuery, NativeQuery } from "metabase-types/types/Query";
import {
  Database as IDatabase,
  InitialSyncStatus,
  DatabaseNativePermission,
} from "metabase-types/api";

import Table from "./Table";
import Schema from "./Schema";
import Metadata from "./Metadata";

export type HydratedDatabaseProperties = {
  tables: Table[];
  schemas: Schema[];
  metadata: Metadata;
};

export default class Database {
  id: number;
  name: string;
  engine: string;
  is_sample: boolean;
  is_full_sync: boolean;
  is_on_demand: boolean;
  auto_run_queries: boolean;
  is_saved_questions?: boolean;
  features: string[];
  native_permissions: DatabaseNativePermission;
  cache_ttl: number | null;
  caveats: string | null;
  description: string | null;
  creator_id?: number;
  created_at: string;
  updated_at: string;
  timezone?: string;
  initial_sync_status: InitialSyncStatus;

  tables: Table[] | null;
  schemas: Schema[] | null;
  metadata: Metadata | null;

  _plainObject: IDatabase;

  constructor(database: IDatabase) {
    this.id = database.id;
    this.name = database.name;
    this.engine = database.engine;
    this.features = database.features;
    this.is_full_sync = database.is_full_sync;
    this.is_sample = database.is_sample;
    this.is_on_demand = database.is_on_demand;
    this.native_permissions = database.native_permissions;
    this.auto_run_queries = database.auto_run_queries;
    this.cache_ttl = database.cache_ttl;
    this.creator_id = database.creator_id;
    this.initial_sync_status = database.initial_sync_status;
    this.caveats = database.caveats;
    this.description = database.description;
    this.created_at = database.created_at;
    this.updated_at = database.updated_at;
    this.is_saved_questions = database.is_saved_questions;

    // these properties are hydrated after instantiation in metabase/selectors/metadata
    this.tables = null;
    this.schemas = null;
    this.metadata = null;

    // Assign all properties to the instance from the `database` object in case
    // there is old, un-typed code that relies on properties missing from IDatabase
    Object.assign(this, database);

    this._plainObject = database;
  }

  displayName() {
    return this.name;
  }

  schema(schemaName: string | undefined | null): Schema | null {
    if (!schemaName) {
      return null;
    }

    return this.metadata?.schema(generateSchemaId(this.id, schemaName)) || null;
  }

  schemaNames() {
    return this.getSchemas()
      .map(s => s.name)
      .sort((a, b) => a.localeCompare(b));
  }

  getSchemas(): Schema[] {
    return this.schemas ?? [];
  }

  schemasCount() {
    return this.getSchemas().length;
  }

  getTables(): Table[] {
    return this.tables ?? [];
  }

  // TABLES
  @memoize
  tablesLookup(): Record<Table["id"], Table> {
    return createLookupByProperty(this.getTables(), "id");
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

  question(query: StructuredQuery = {}): Question {
    return Question.create({
      metadata: this.metadata,
      dataset_query: {
        database: this.id,
        type: "query",
        query,
      },
    });
  }

  nativeQuestion(native: Partial<NativeQuery> = {}): Question {
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

  /** Returns a database containing only the saved questions from the same database, if any */
  savedQuestionsDatabase(): Database | undefined {
    return this.metadata?.databasesList().find(db => db.is_saved_questions);
  }

  getPlainObject() {
    return this._plainObject;
  }
}
