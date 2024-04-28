/* eslint-disable import/order */
import _ from "underscore";

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question";

import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { getAggregationOperators } from "metabase-lib/v1/operators/utils";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import type { NormalizedTable } from "metabase-types/api";
import { singularize } from "metabase/lib/formatting";

import type Database from "./Database";
import type Field from "./Field";
import type ForeignKey from "./ForeignKey";
import type Metadata from "./Metadata";
import type Metric from "./Metric";
import type Schema from "./Schema";
import type Segment from "./Segment";

interface Table
  extends Omit<
    NormalizedTable,
    "db" | "schema" | "fields" | "fks" | "segments" | "metrics"
  > {
  db?: Database;
  schema?: Schema;
  fields?: Field[];
  fks?: ForeignKey[];
  segments?: Segment[];
  metrics?: Metric[];
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
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

  getMetrics() {
    return this.metrics ?? [];
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
    return this.question().setDefaultDisplay();
  }

  question() {
    return Question.create({
      databaseId: this.db && this.db.id,
      tableId: this.id,
      metadata: this.metadata,
    });
  }

  savedQuestionId() {
    const match = String(this.id).match(/card__(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  legacyQuery(query = {}) {
    return (
      this.question().legacyQuery({
        useStructuredQuery: true,
      }) as StructuredQuery
    ).updateQuery(q => ({
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
    return fks
      .map(fk => fk.origin?.table)
      .filter(table => table != null) as Table[];
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

  clone() {
    const table = new Table(this.getPlainObject());
    Object.assign(table, this);
    return table;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Table;
