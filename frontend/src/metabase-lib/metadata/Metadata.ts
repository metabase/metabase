import _ from "underscore";
import {
  CardId,
  DatabaseId,
  FieldId,
  MetricId,
  SchemaId,
  SegmentId,
  TableId,
} from "metabase-types/api";
import type Question from "../Question";
import type Database from "./Database";
import type Table from "./Table";
import type Schema from "./Schema";
import type Field from "./Field";
import type Metric from "./Metric";
import type Segment from "./Segment";
import { getUniqueFieldId } from "./utils/fields";

class Metadata {
  databases: Record<string, Database> = {};
  schemas: Record<string, Schema> = {};
  tables: Record<string, Table> = {};
  fields: Record<string, Field> = {};
  metrics: Record<string, Metric> = {};
  segments: Record<string, Segment> = {};
  questions: Record<string, Question> = {};

  /**
   * @deprecated this won't be sorted or filtered in a meaningful way
   * @returns {Database[]}
   */
  databasesList({ savedQuestions = true } = {}): Database[] {
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
  tablesList(): Table[] {
    return Object.values(this.tables);
  }

  /**
   * @deprecated this won't be sorted or filtered in a meaningful way
   * @returns {Metric[]}
   */
  metricsList(): Metric[] {
    return Object.values(this.metrics);
  }

  segmentsList(): Segment[] {
    return Object.values(this.segments);
  }

  segment(segmentId: SegmentId | undefined | number): Segment | null {
    return (segmentId != null && this.segments[segmentId]) || null;
  }

  metric(metricId: MetricId | undefined | null): Metric | null {
    return (metricId != null && this.metrics[metricId]) || null;
  }

  database(databaseId: DatabaseId | undefined | null): Database | null {
    return (databaseId != null && this.databases[databaseId]) || null;
  }

  schema(schemaId: SchemaId | undefined | null): Schema | null {
    return (schemaId != null && this.schemas[schemaId]) || null;
  }

  table(tableId: TableId | undefined | number): Table | null {
    return (tableId != null && this.tables[tableId]) || null;
  }

  field(
    fieldId: FieldId | string | undefined | null,
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

  question(cardId: CardId | undefined | null): Question | null {
    return (cardId != null && this.questions[cardId]) || null;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Metadata;
