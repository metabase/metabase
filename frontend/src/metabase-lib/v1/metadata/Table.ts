import _ from "underscore";

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import { singularize } from "metabase/utils/formatting";
import type { Measure, NormalizedTable, Segment } from "metabase-types/api";

import Question from "../Question";

import type Database from "./Database";
import type Field from "./Field";
import ForeignKey from "./ForeignKey";
import type Metadata from "./Metadata";
import type Schema from "./Schema";
import { getSchemaDisplayName } from "./utils/schema";

interface Table extends Omit<
  NormalizedTable,
  "db" | "schema" | "fields" | "fks" | "segments" | "measures" | "metrics"
> {
  // db / schema / fields / fks / segments / measures / metrics are provided as
  // lazy getters on the class below.
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Table {
  private readonly _plainObject: NormalizedTable;

  // Lazily-resolved cross-links, memoized for the life of the instance. See the
  // getters below — these are populated on first access, not up front.
  private _db?: Database;
  private _dbResolved = false;
  private _schema?: Schema;
  private _schemaResolved = false;
  private _fields?: Field[];
  private _fks?: ForeignKey[];
  private _fksResolved = false;
  private _segments?: Segment[];
  private _measures?: Measure[];
  private _metrics?: Question[];

  constructor(table: NormalizedTable) {
    this._plainObject = table;
    this.fieldsLookup = _.memoize(this.fieldsLookup);
    // Strip the relational keys from the raw object so they don't shadow the
    // lazy getters defined on the prototype.
    const {
      db: _db,
      schema: _schema,
      fields: _fields,
      fks: _fks,
      segments: _segments,
      measures: _measures,
      metrics: _metrics,
      original_fields: _original_fields,
      ...rest
    } = table;
    Object.assign(this, rest);
  }

  getPlainObject(): NormalizedTable {
    return this._plainObject;
  }

  get db(): Database | undefined {
    if (!this._dbResolved) {
      const { db, db_id } = this._plainObject;
      this._db = this.metadata?.database(db ?? db_id) ?? undefined;
      this._dbResolved = true;
    }
    return this._db;
  }

  get schema(): Schema | undefined {
    if (!this._schemaResolved) {
      this._schema =
        this.metadata?.schema(this._plainObject.schema) ?? undefined;
      this._schemaResolved = true;
    }
    return this._schema;
  }

  get fields(): Field[] {
    if (!this._fields) {
      const fieldIds = this._plainObject.fields ?? [];
      this._fields = fieldIds
        .map((id) => this.metadata?.field(id) ?? null)
        .filter((field): field is Field => field != null);
    }
    return this._fields;
  }

  get fks(): ForeignKey[] | undefined {
    if (!this._fksResolved) {
      this._fks = this._plainObject.fks?.map((fk) => {
        const instance = new ForeignKey(fk);
        instance.metadata = this.metadata;
        instance.origin = this.metadata?.field(fk.origin_id) ?? undefined;
        instance.destination =
          this.metadata?.field(fk.destination_id) ?? undefined;
        return instance;
      });
      this._fksResolved = true;
    }
    return this._fks;
  }

  get segments(): Segment[] {
    if (!this._segments) {
      const segmentIds = this._plainObject.segments ?? [];
      this._segments = segmentIds
        .map((id) => this.metadata?.segment(id) ?? null)
        .filter((segment): segment is Segment => segment != null);
    }
    return this._segments;
  }

  get measures(): Measure[] {
    if (!this._measures) {
      const measureIds = this._plainObject.measures ?? [];
      this._measures = measureIds
        .map((id) => this.metadata?.measure(id) ?? null)
        .filter((measure): measure is Measure => measure != null);
    }
    return this._measures;
  }

  get metrics(): Question[] {
    if (!this._metrics) {
      const metricIds = this._plainObject.metrics ?? [];
      this._metrics = metricIds
        .map((id) => this.metadata?.question(id) ?? null)
        .filter((metric): metric is Question => metric != null);
    }
    return this._metrics;
  }

  // Setters let existing callers still override a cross-link explicitly (e.g.
  // cloning a table and replacing its fields); reads stay lazy otherwise.
  set db(value: Database | undefined) {
    this._db = value;
    this._dbResolved = true;
  }

  set schema(value: Schema | undefined) {
    this._schema = value;
    this._schemaResolved = true;
  }

  set fields(value: Field[] | undefined) {
    this._fields = value;
  }

  set fks(value: ForeignKey[] | undefined) {
    this._fks = value;
    this._fksResolved = true;
  }

  set segments(value: Segment[] | undefined) {
    this._segments = value;
  }

  set measures(value: Measure[] | undefined) {
    this._measures = value;
  }

  set metrics(value: Question[] | undefined) {
    this._metrics = value;
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
      (includeSchema && this.schema
        ? getSchemaDisplayName(this.schema.name) + "."
        : "") + this.display_name
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
