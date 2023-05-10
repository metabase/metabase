// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question"; // eslint-disable-line import/order
import { singularize } from "metabase/lib/formatting";
import type {
  Table as ITable,
  TableFieldOrder,
  TableId,
  TableVisibilityType,
} from "metabase-types/api";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import { getAggregationOperators } from "metabase-lib/operators/utils";
import { createLookupByProperty, memoizeClass } from "metabase-lib/utils";
import Base from "./Base";
import type Metadata from "./Metadata";
import type Schema from "./Schema";
import type Field from "./Field";
import type Database from "./Database";
import type Metric from "./Metric";
import type Segment from "./Segment";

/**
 * @typedef { import("./Metadata").SchemaName } SchemaName
 * @typedef { import("./Metadata").EntityType } EntityType
 * @typedef { import("./Metadata").StructuredQuery } StructuredQuery
 */

/** This is the primary way people interact with tables */

class TableInner extends Base {
  id: TableId;
  name: string;
  description?: string;
  fks?: any[];
  schema?: Schema;
  display_name: string;
  schema_name: string;
  db_id: number;
  fields: Field[];
  field_order: TableFieldOrder;
  metrics: Metric[];
  segments: Segment[];
  metadata?: Metadata;
  db?: Database | undefined | null;
  visibility_type: TableVisibilityType;

  getPlainObject(): ITable {
    return this._plainObject;
  }

  isVirtualCard() {
    return isVirtualCardId(this.id);
  }

  hasSchema() {
    return (this.schema_name && this.db && this.db.schemas.length > 1) || false;
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

  /**
   * @returns {StructuredQuery}
   */
  query(query = {}) {
    return this.question()
      .query()
      .updateQuery(q => ({ ...q, ...query }));
  }

  dimensions() {
    return this.fields.map(field => field.dimension());
  }

  displayName({ includeSchema } = {}) {
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
    return this.fields.filter(field => field.isDate());
  }

  // AGGREGATIONS
  aggregationOperators() {
    return getAggregationOperators(this.db, this.fields);
  }

  aggregationOperatorsLookup() {
    return createLookupByProperty(this.aggregationOperators(), "short");
  }

  aggregationOperator(short) {
    return this.aggregationOperatorsLookup()[short];
  }

  // FIELDS
  fieldsLookup() {
    return createLookupByProperty(this.fields, "id");
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
    return fks.map(fk => new Table(fk.origin.table));
  }

  foreignTables(): Table[] {
    if (!Array.isArray(this.fields)) {
      return [];
    }
    return this.fields
      .filter(field => field.isFK() && field.fk_target_field_id)
      .map(field => this.metadata.field(field.fk_target_field_id)?.table)
      .filter(Boolean);
  }

  primaryKeys(): { field: Field; index: number }[] {
    const pks = [];
    this.fields.forEach((field, index) => {
      if (field.isPK()) {
        pks.push({ field, index });
      }
    });
    return pks;
  }

  clone() {
    const plainObject = this.getPlainObject();
    const newTable = new Table(this);
    newTable._plainObject = plainObject;
    return newTable;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Table extends memoizeClass<TableInner>(
  "aggregationOperators",
  "aggregationOperatorsLookup",
  "fieldsLookup",
)(TableInner) {}
