// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import Metric from "metabase-lib/lib/metadata/Metric";
import type Question from "../Question";
import Base from "./Base";
import type Database from "./Database";
import type Table from "./Table";
import type Schema from "./Schema";
import type Field from "./Field";
import { getUniqueFieldId } from "./utils/fields";

/**
 * @typedef { import("./metadata").DatabaseId } DatabaseId
 * @typedef { import("./metadata").SchemaId } SchemaId
 * @typedef { import("./metadata").TableId } TableId
 * @typedef { import("./metadata").FieldId } FieldId
 * @typedef { import("./metadata").MetricId } MetricId
 * @typedef { import("./metadata").SegmentId } SegmentId
 */

/**
 * Wrapper class for the entire metadata store
 */

export default class Metadata extends Base {
  databases: { [databaseId: string]: Database };
  questions: { [cardId: string]: Question };
  tables: { [tableId: string]: Table };

  /**
   * @deprecated this won't be sorted or filtered in a meaningful way
   * @returns {Database[]}
   */
  databasesList({ savedQuestions = true } = {}) {
    return _.chain(this.databases)
      .values()
      .filter(db => savedQuestions || !db.is_saved_questions)
      .sortBy(db => db.name)
      .value();
  }

  /**
   * @deprecated this won't be sorted or filtered in a meaningful way
   * @returns {Table[]}
   */
  tablesList() {
    return Object.values(this.tables);
  }

  /**
   * @deprecated this won't be sorted or filtered in a meaningful way
   * @returns {Metric[]}
   */
  metricsList() {
    return Object.values(this.metrics);
  }

  /**
   * @deprecated this won't be sorted or filtered in a meaningful way
   * @returns {Segment[]}
   */
  segmentsList() {
    return Object.values(this.segments);
  }

  /**
   * @param {SegmentId} segmentId
   * @returns {?Segment}
   */
  segment(segmentId) {
    return (segmentId != null && this.segments[segmentId]) || null;
  }

  /**
   * @param {MetricId} metricId
   * @returns {?Metric}
   */
  metric(metricId): Metric | null {
    return (metricId != null && this.metrics[metricId]) || null;
  }

  /**
   * @param {DatabaseId} databaseId
   * @returns {?Database}
   */
  database(databaseId): Database | null {
    return (databaseId != null && this.databases[databaseId]) || null;
  }

  /**
   * @param {SchemaId} schemaId
   * @returns {Schema}
   */
  schema(schemaId): Schema | null {
    return (schemaId != null && this.schemas[schemaId]) || null;
  }

  /**
   *
   * @param {TableId} tableId
   * @returns {?Table}
   */
  table(tableId): Table | null {
    return (tableId != null && this.tables[tableId]) || null;
  }

  field(
    fieldId: Field["id"] | Field["name"] | undefined | null,
    tableId?: Table["id"] | undefined | null,
  ): Field | null {
    if (fieldId == null) {
      return null;
    }

    const uniqueId = getUniqueFieldId({
      id: fieldId,
      table_id: tableId,
    } as Field);

    return this.fields[uniqueId] || null;
  }

  question(cardId): Question | null {
    return (cardId != null && this.questions[cardId]) || null;
  }

  /**
   * @private
   * @param {Object.<number, Database>} databases
   * @param {Object.<number, Table>} tables
   * @param {Object.<number, Field>} fields
   * @param {Object.<number, Metric>} metrics
   * @param {Object.<number, Segment>} segments
   */

  /* istanbul ignore next */
  _constructor(databases: Database[], tables, fields, metrics, segments) {
    this.databases = databases;
    this.tables = tables;
    this.fields = fields;
    this.metrics = metrics;
    this.segments = segments;
  }
}
