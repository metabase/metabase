import { assocIn } from "icepick";
import _ from "underscore";

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import { singularize } from "metabase/utils/formatting";
import type { NormalizedTable } from "metabase-types/api";

import Question from "../Question";

import type Database from "./Database";
import type Field from "./Field";
import type ForeignKey from "./ForeignKey";
import type Measure from "./Measure";
import type Metadata from "./Metadata";
import type Schema from "./Schema";
import type Segment from "./Segment";

interface Table extends Omit<
  NormalizedTable,
  "db" | "schema" | "fields" | "fks" | "segments" | "measures" | "metrics"
> {
  db?: Database;
  schema?: Schema;
  fields?: Field[];
  fks?: ForeignKey[];
  segments?: Segment[];
  measures?: Measure[];
  metrics?: Question[];
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Table {
  private readonly _plainObject: NormalizedTable;

  constructor(table: NormalizedTable) {
    this._plainObject = table;
    this.fieldsLookup = _.memoize(this.fieldsLookup);
    Object.assign(this, table);
  }

  getPlainObject(): NormalizedTable {
    return this._plainObject;
  }

  getFields() {
    return this.fields ?? [];
  }

  hasSchema() {
    return (
      (this.schema_name && this.db && this.db.getSchemas().length > 1) || false
    );
  }

  // Could be replaced with hydrated database property in selectors/metadata.js (instead / in addition to `table.db`)
  get database() {
    return this.db;
  }

  newQuestion() {
    return this.question().setDefaultDisplay();
  }

  question() {
    const question = Question.create({
      DEPRECATED_RAW_MBQL_databaseId: this.db && this.db.id,
      DEPRECATED_RAW_MBQL_tableId: this.id,
      metadata: this.metadata,
    });
    return applyTableDefaults(question, this.settings);
  }

  displayName({ includeSchema }: { includeSchema?: boolean } = {}) {
    return (
      (includeSchema && this.schema ? this.schema.displayName() + "." : "") +
      this.display_name
    );
  }

  /**
   * The singular form of the object type this table represents
   * Currently we try to guess this by singularizing `display_name`, but ideally it would be configurable in metadata
   * See also `field.targetObjectName()`
   */
  objectName() {
    return singularize(this.displayName());
  }

  dateFields() {
    return this.getFields().filter((field) => field.isDate());
  }

  // FIELDS
  fieldsLookup() {
    return Object.fromEntries(
      this.getFields().map((field) => [field.id, field]),
    );
  }

  // @deprecated: use fieldsLookup
  get fields_lookup() {
    return this.fieldsLookup();
  }

  numFields(): number {
    return this.fields?.length || 0;
  }

  connectedTables(): Table[] {
    const fks = this.fks || [];
    return fks
      .map((fk) => fk.origin?.table)
      .filter((table) => table != null) as Table[];
  }

  foreignTables(): Table[] {
    const fields = this.getFields();
    if (!fields) {
      return [];
    }
    return fields
      .filter((field) => field.isFK() && field.fk_target_field_id)
      .map((field) => this.metadata?.field(field.fk_target_field_id)?.table)
      .filter(Boolean) as Table[];
  }

  clone() {
    const table = new Table(this.getPlainObject());
    Object.assign(table, this);
    return table;
  }
}

/**
 * Apply admin-set per-table defaults to a freshly-created Question. Defaults
 * only seed the initial Question — user edits in the Query Builder override them.
 */
function applyTableDefaults(
  question: Question,
  settings: Table["settings"] | undefined,
): Question {
  if (!settings) {
    return question;
  }
  const { default_row_limit } = settings;
  if (typeof default_row_limit !== "number" || default_row_limit <= 0) {
    return question;
  }
  // Native queries have no :limit at the MBQL level; admin defaults only apply
  // to structured queries. This matches the shape of the question created by
  // `Table.question()` (always `type: "query"` via `STRUCTURED_QUERY_TEMPLATE`).
  const datasetQuery = question.datasetQuery();
  if (!isStructuredDatasetQuery(datasetQuery)) {
    return question;
  }
  return question.setDatasetQuery(
    assocIn(datasetQuery, ["query", "limit"], default_row_limit),
  );
}

function isStructuredDatasetQuery(
  query: unknown,
): query is { type: "query"; query: Record<string, unknown> } {
  return (
    typeof query === "object" &&
    query !== null &&
    (query as { type?: unknown }).type === "query" &&
    typeof (query as { query?: unknown }).query === "object" &&
    (query as { query?: unknown }).query !== null
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Table;
