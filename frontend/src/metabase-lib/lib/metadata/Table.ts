// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question";
import Schema from "./Schema";
import Base from "./Base";
import { singularize } from "metabase/lib/formatting";
import { getAggregationOperators } from "metabase/lib/schema_metadata";
import { createLookupByProperty, memoizeClass } from "metabase-lib/lib/utils";

/**
 * @typedef { import("./metadata").SchemaName } SchemaName
 * @typedef { import("./metadata").EntityType } EntityType
 * @typedef { import("./metadata").StructuredQuery } StructuredQuery
 */

/** This is the primary way people interact with tables */

class TableInner extends Base {
  id: number;
  description?: string;
  fks?: any[];
  schema?: Schema;
  display_name: string;
  schema_name: string;
  db_id: number;

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
    return getAggregationOperators(this);
  }

  aggregationOperatorsLookup() {
    return createLookupByProperty(this.aggregationOperators(), "short");
  }

  aggregationOperator(short) {
    return this.aggregation_operators_lookup[short];
  }

  // @deprecated: use aggregationOperators
  get aggregation_operators() {
    return this.aggregationOperators();
  }

  // @deprecated: use aggregationOperatorsLookup
  get aggregation_operators_lookup() {
    return this.aggregationOperatorsLookup();
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

  /**
   * @private
   * @param {string} description
   * @param {Database} db
   * @param {Schema?} schema
   * @param {SchemaName} [schema_name]
   * @param {Field[]} fields
   * @param {EntityType} entity_type
   */

  /* istanbul ignore next */
  _constructor(description, db, schema, schema_name, fields, entity_type) {
    this.description = description;
    this.db = db;
    this.schema = schema;
    this.schema_name = schema_name;
    this.fields = fields;
    this.entity_type = entity_type;
  }
}

export default class Table extends memoizeClass<TableInner>(
  "aggregationOperators",
  "aggregationOperatorsLookup",
  "fieldsLookup",
)(TableInner) {}
