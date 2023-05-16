// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import type Question from "../Question";
import Base from "./Base";
import type Database from "./Database";
import type Table from "./Table";
import type Schema from "./Schema";
import type Field from "./Field";
import type Metric from "./Metric";
import type Segment from "./Segment";
import { getUniqueFieldId } from "./utils/fields";

/**
 * @typedef { import("./Metadata").DatabaseId } DatabaseId
 * @typedef { import("./Metadata").SchemaId } SchemaId
 * @typedef { import("./Metadata").TableId } TableId
 * @typedef { import("./Metadata").FieldId } FieldId
 * @typedef { import("./Metadata").MetricId } MetricId
 * @typedef { import("./Metadata").SegmentId } SegmentId
 */

/**
 * Wrapper class for the entire metadata store
 */

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Metadata extends Base {
  databases: Record<string, Database>;
  schemas: Record<string, Schema>;
  tables: Record<string, Table>;
  fields: Record<string, Field>;
  metrics: Record<string, Metric>;
  segments: Record<string, Segment>;
  questions: Record<string, Question>;

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
}
