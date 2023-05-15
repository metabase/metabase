import _ from "underscore";
// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question"; // eslint-disable-line import/order
import { singularize } from "metabase/lib/formatting";
import type { NormalizedTable } from "metabase-types/api";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import { getAggregationOperators } from "metabase-lib/operators/utils";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Metadata from "./Metadata";
import type Schema from "./Schema";
import type Field from "./Field";
import type Database from "./Database";
import type Metric from "./Metric";
import type Segment from "./Segment";

interface Table
  extends Omit<
    NormalizedTable,
    "db" | "schema" | "fields" | "segments" | "metrics"
  > {
  db?: Database;
  schema?: Schema;
  fields?: Field[];
  segments?: Segment[];
  metrics?: Metric[];
  metadata?: Metadata;
}

class Table {
  private readonly _plainObject: NormalizedTable;

  constructor(table: NormalizedTable) {
    this._plainObject = table;
    this.aggregationOperators = _.memoize(this.aggregationOperators);
    this.aggregationOperatorsLookup = _.memoize(
      this.aggregationOperatorsLookup,
    );
    this.fieldsLookup = _.memoize(this.fieldsLookup);
    Object.assign(this, table);
  }

  getPlainObject(): NormalizedTable {
    return this._plainObject;
  }

  getFields() {
    return this.fields ?? [];
  }

  isVirtualCard() {
    return isVirtualCardId(this.id);
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
    return this.question().setDefaultQuery().setDefaultDisplay();
  }

  question() {
    return Question.create({
      databaseId: this.db && this.db.id,
      tableId: this.id,
      metadata: this.metadata,
    });
  }

  isSavedQuestion() {
    return this.savedQuestionId() !== null;
  }

  savedQuestionId() {
    const match = String(this.id).match(/card__(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  query(query = {}) {
    return (this.question().query() as StructuredQuery).updateQuery(q => ({
      ...q,
      ...query,
    }));
  }

  dimensions() {
    return this.getFields().map(field => field.dimension());
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
    return this.getFields().filter(field => field.isDate());
  }

  // AGGREGATIONS
  aggregationOperators() {
    return getAggregationOperators(this.db, this.fields);
  }

  aggregationOperatorsLookup() {
    return Object.fromEntries(
      this.aggregationOperators().map(op => [op.short, op]),
    );
  }

  aggregationOperator(short: string) {
    return this.aggregationOperatorsLookup()[short];
  }

  // FIELDS
  fieldsLookup() {
    return Object.fromEntries(this.getFields().map(field => [field.id, field]));
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return fks.map(fk => new Table(fk.origin.table));
  }

  foreignTables(): Table[] {
    const fields = this.getFields();
    if (!fields) {
      return [];
    }
    return fields
      .filter(field => field.isFK() && field.fk_target_field_id)
      .map(field => this.metadata?.field(field.fk_target_field_id)?.table)
      .filter(Boolean) as Table[];
  }

  primaryKeys(): { field: Field; index: number }[] {
    const pks: { field: Field; index: number }[] = [];
    this.getFields().forEach((field, index) => {
      if (field.isPK()) {
        pks.push({ field, index });
      }
    });
    return pks;
  }

  clone() {
    return new Table(this.getPlainObject());
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Table;
