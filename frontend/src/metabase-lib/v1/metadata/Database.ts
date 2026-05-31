import _ from "underscore";

import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type { NativeQuery, NormalizedDatabase } from "metabase-types/api";

import Question from "../Question";

import type Metadata from "./Metadata";
import type Schema from "./Schema";
import type Table from "./Table";

interface Database extends Omit<NormalizedDatabase, "tables" | "schemas"> {
  // tables / schemas are provided as lazy getters on the class below.
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Database {
  private readonly _plainObject: NormalizedDatabase;

  // Lazily-resolved cross-links, memoized for the life of the instance.
  private _tables?: Table[];
  private _schemas?: Schema[];

  constructor(database: NormalizedDatabase) {
    this._plainObject = database;
    this.tablesLookup = _.memoize(this.tablesLookup);
    // Strip the relational keys so they don't shadow the lazy getters.
    const { tables: _tables, schemas: _schemas, ...rest } = database;
    Object.assign(this, rest);
  }

  getPlainObject(): NormalizedDatabase {
    return this._plainObject;
  }

  get tables(): Table[] {
    if (!this._tables) {
      const tableIds = this._plainObject.tables ?? [];
      if (tableIds.length > 0) {
        this._tables = tableIds
          .map((id) => this.metadata?.table(id) ?? null)
          .filter((table): table is Table => table != null);
      } else {
        this._tables = (this.metadata?.tablesList() ?? []).filter(
          (table) =>
            !isVirtualCardId(table.id) &&
            table.schema &&
            table.db_id === this.id,
        );
      }
    }
    return this._tables;
  }

  get schemas(): Schema[] {
    if (!this._schemas) {
      const schemaIds = this._plainObject.schemas;
      if (schemaIds) {
        this._schemas = schemaIds
          .map((schemaId) => this.metadata?.schema(schemaId) ?? null)
          .filter((schema): schema is Schema => schema != null);
      } else {
        this._schemas = Object.values(this.metadata?.schemas ?? {}).filter(
          (schema) => schema.database && schema.database.id === this.id,
        );
      }
    }
    return this._schemas;
  }

  // Setters let callers still override a cross-link explicitly; reads stay lazy.
  set tables(value: Table[] | undefined) {
    this._tables = value;
  }

  set schemas(value: Schema[] | undefined) {
    this._schemas = value;
  }

  displayName() {
    return this.name;
  }

  schema(schemaName: string | undefined) {
    return this.metadata?.schema(generateSchemaId(this.id, schemaName));
  }

  schemaNames() {
    return this.getSchemas()
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b));
  }

  getSchemas() {
    return this.schemas ?? [];
  }

  schemasCount() {
    return this.getSchemas().length;
  }

  getTables() {
    return this.tables ?? [];
  }

  tablesLookup() {
    return Object.fromEntries(
      this.getTables().map((table) => [table.id, table]),
    );
  }

  // @deprecated: use tablesLookup
  get tables_lookup() {
    return this.tablesLookup();
  }

  hasFeature(feature: string | null | undefined) {
    if (!feature) {
      return true;
    }

    const set = new Set<string>(this.features);

    if (feature === "join") {
      return (
        set.has("left-join") ||
        set.has("right-join") ||
        set.has("inner-join") ||
        set.has("full-join")
      );
    }

    return set.has(feature);
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

  canUpload() {
    return this.can_upload;
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

  hasDatabaseRoutingEnabled() {
    return !!this.router_user_attribute;
  }

  nativeQuestion(native: Partial<NativeQuery> = {}) {
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

  nativeQuery(native: Partial<NativeQuery>) {
    return this.nativeQuestion(native).legacyNativeQuery();
  }

  savedQuestionsDatabase() {
    return this.metadata?.databasesList().find((db) => db.is_saved_questions);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Database;
