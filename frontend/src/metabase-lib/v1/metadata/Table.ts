import _ from "underscore";

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import { singularize } from "metabase/lib/formatting";
import type { NormalizedTable } from "metabase-types/api";

import Question from "../Question";

import type Database from "./Database";
import type Field from "./Field";
import type ForeignKey from "./ForeignKey";
import type Measure from "./Measure";
import type Metadata from "./Metadata";
import type Schema from "./Schema";
import type Segment from "./Segment";

interface Table
  extends Omit<
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
    return Question.create({
      DEPRECATED_RAW_MBQL_databaseId: this.db && this.db.id,
      DEPRECATED_RAW_MBQL_tableId: this.id,
      metadata: this.metadata,
    });
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Table;
