import _ from "underscore";

import Database from "./Database";
import Schema from "./Schema";
import Table from "./Table";
import Field from "./Field";
import Segment from "./Segment";
import Metric from "./Metric";

/**
 * Wrapper class for the entire metadata store
 */

// ehhh
type GenericId = number | string;

export interface IMetadata {
  databases?: Record<GenericId, Database>;
  schemas?: Record<GenericId, Schema>;
  tables?: Record<GenericId, Table>;
  fields?: Record<GenericId, Field>;
  segments?: Record<GenericId, Segment>;
  metrics?: Record<GenericId, Metric>;
}

export default class Metadata {
  databases: Record<GenericId, Database>;
  schemas: Record<GenericId, Schema>;
  tables: Record<GenericId, Table>;
  fields: Record<GenericId, Field>;
  segments: Record<GenericId, Segment>;
  metrics: Record<GenericId, Metric>;

  constructor(metadata: IMetadata = {}) {
    this.databases = metadata.databases || {};
    this.schemas = metadata.schemas || {};
    this.tables = metadata.tables || {};
    this.fields = metadata.fields || {};
    this.segments = metadata.segments || {};
    this.metrics = metadata.metrics || {};

    Object.assign(this, metadata);
  }

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
  segment(segmentId?: GenericId) {
    return (segmentId != null && this.segments[segmentId]) || null;
  }

  /**
   * @param {MetricId} metricId
   * @returns {?Metric}
   */
  metric(metricId?: GenericId) {
    return (metricId != null && this.metrics[metricId]) || null;
  }

  /**
   * @param {DatabaseId} databaseId
   * @returns {?Database}
   */
  database(databaseId?: GenericId) {
    return (databaseId != null && this.databases[databaseId]) || null;
  }

  /**
   * @param {SchemaId} schemaId
   * @returns {Schema}
   */
  schema(schemaId?: GenericId) {
    return (schemaId != null && this.schemas[schemaId]) || null;
  }

  /**
   *
   * @param {TableId} tableId
   * @returns {?Table}
   */
  table(tableId?: GenericId) {
    return (tableId != null && this.tables[tableId]) || null;
  }

  /**
   * @param {FieldId} fieldId
   * @returns {?Field}
   */
  field(fieldId?: GenericId) {
    return (fieldId != null && this.fields[fieldId]) || null;
  }
}
