import _ from "underscore";
import {
  NativeQuery,
  NormalizedDatabase,
  StructuredQuery,
} from "metabase-types/api";
import { generateSchemaId } from "metabase-lib/metadata/utils/schema";
import Question from "../Question";
import Table from "./Table";
import Schema from "./Schema";
import Metadata from "./Metadata";

interface Database extends Omit<NormalizedDatabase, "tables" | "schemas"> {
  tables?: Table[];
  schemas?: Schema[];
  metadata?: Metadata;
}

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

  hasFeature(feature: string | undefined) {
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

  newQuestion() {
    return this.question().setDefaultQuery().setDefaultDisplay();
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
    return this.nativeQuestion(native).query();
  }

  savedQuestionsDatabase() {
    return this.metadata?.databasesList().find(db => db.is_saved_questions);
  }
}

export default Database;
