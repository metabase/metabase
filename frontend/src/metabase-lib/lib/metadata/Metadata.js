/* @flow weak */

import Base from "./Base";

import Database from "./Database";
import Table from "./Table";
import Field from "./Field";
import Segment from "./Segment";
import Metric from "./Metric";

import type { DatabaseId } from "metabase/meta/types/Database";
import type { TableId } from "metabase/meta/types/Table";
import type { FieldId } from "metabase/meta/types/Field";
import type { MetricId } from "metabase/meta/types/Metric";
import type { SegmentId } from "metabase/meta/types/Segment";

/**
 * Wrapper class for the entire metadata store
 */
export default class Metadata extends Base {
  databases: { [id: DatabaseId]: Database };
  tables: { [id: TableId]: Table };
  fields: { [id: FieldId]: Field };
  metrics: { [id: MetricId]: Metric };
  segments: { [id: SegmentId]: Segment };

  databasesList(): Database[] {
    // $FlowFixMe
    return (Object.values(this.databases): Database[]);
  }

  tablesList(): Database[] {
    // $FlowFixMe
    return (Object.values(this.tables): Database[]);
  }

  metricsList(): Metric[] {
    // $FlowFixMe
    return (Object.values(this.metrics): Metric[]);
  }

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

  table(tableId): ?Table {
    return (tableId != null && this.tables[tableId]) || null;
  }

  field(fieldId): ?Field {
    return (fieldId != null && this.fields[fieldId]) || null;
  }
}
