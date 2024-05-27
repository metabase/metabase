import _ from "underscore";

import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  NativeQuery,
  NormalizedDatabase,
  StructuredQuery,
} from "metabase-types/api";

import Question from "../Question";

import type Metadata from "./Metadata";
import type Schema from "./Schema";
import type Table from "./Table";

interface Database extends Omit<NormalizedDatabase, "tables" | "schemas"> {
  tables?: Table[];
  schemas?: Schema[];
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Database {
  private readonly _plainObject: NormalizedDatabase;

  constructor(database: NormalizedDatabase) {
    this._plainObject = database;
    this.tablesLookup = _.memoize(this.tablesLookup);
    Object.assign(this, database);
  }

  getPlainObject(): NormalizedDatabase {
    return this._plainObject;
  }

  displayName() {
    return this.name;
  }

  schema(schemaName: string | undefined) {
    return this.metadata?.schema(generateSchemaId(this.id, schemaName));
  }

  schemaNames() {
    return this.getSchemas()
      .map(s => s.name)
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
    return Object.fromEntries(this.getTables().map(table => [table.id, table]));
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

  newQuestion() {
    return this.question().setDefaultDisplay();
  }

  question(
    query: StructuredQuery = {
      "source-table": undefined,
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
    return this.nativeQuestion(native).legacyQuery();
  }

  savedQuestionsDatabase() {
    return this.metadata?.databasesList().find(db => db.is_saved_questions);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Database;
