/* @flow weak */

import _ from "underscore";

import Base from "./Base";

import Database from "./Database";
import Table from "./Table";
import Schema from "./Schema";
import Field from "./Field";
import Segment from "./Segment";
import Metric from "./Metric";

import Question from "../Question";

import type { DatabaseId } from "metabase-types/types/Database";
import type { TableId } from "metabase-types/types/Table";
import type { FieldId } from "metabase-types/types/Field";
import type { MetricId } from "metabase-types/types/Metric";
import type { SegmentId } from "metabase-types/types/Segment";

/**
 * Wrapper class for the entire metadata store
 */
export default class Metadata extends Base {
  databases: { [id: DatabaseId]: Database };
  tables: { [id: TableId]: Table };
  fields: { [id: FieldId]: Field };
  metrics: { [id: MetricId]: Metric };
  segments: { [id: SegmentId]: Segment };

  // DEPRECATED: this won't be sorted or filtered in a meaningful way
  databasesList({ savedQuestions = true } = {}): Database[] {
    return _.chain(this.databases)
      .values()
      .filter(db => savedQuestions || !db.is_saved_questions)
      .sortBy(db => db.name)
      .value();
  }

  // DEPRECATED: this won't be sorted or filtered in a meaningful way
  tablesList(): Database[] {
    // $FlowFixMe
    return (Object.values(this.tables): Database[]);
  }

  // DEPRECATED: this won't be sorted or filtered in a meaningful way
  metricsList(): Metric[] {
    // $FlowFixMe
    return (Object.values(this.metrics): Metric[]);
  }

  // DEPRECATED: this won't be sorted or filtered in a meaningful way
  segmentsList(): Metric[] {
    // $FlowFixMe
    return (Object.values(this.segments): Segment[]);
  }

  segment(segmentId): ?Segment {
    return (segmentId != null && this.segments[segmentId]) || null;
  }

  metric(metricId): ?Metric {
    return (metricId != null && this.metrics[metricId]) || null;
  }

  database(databaseId): ?Database {
    return (databaseId != null && this.databases[databaseId]) || null;
  }

  schema(schemaId): ?Schema {
    return (schemaId != null && this.schemas[schemaId]) || null;
  }

  table(tableId): ?Table {
    return (tableId != null && this.tables[tableId]) || null;
  }

  field(fieldId): ?Field {
    return (fieldId != null && this.fields[fieldId]) || null;
  }

  question(card) {
    return new Question(card, this);
  }
}
