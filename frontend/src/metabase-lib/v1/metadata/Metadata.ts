import _ from "underscore";

import type {
  CardId,
  DatabaseId,
  FieldId,
  FieldReference,
  MetricId,
  SchemaId,
  SegmentId,
  SettingKey,
  Settings,
  TableId,
} from "metabase-types/api";

import type Question from "../Question";

import type Database from "./Database";
import type Field from "./Field";
import type Metric from "./Metric";
import type Schema from "./Schema";
import type Segment from "./Segment";
import type Table from "./Table";
import { getUniqueFieldId } from "./utils/fields";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "./utils/saved-questions";

interface MetadataOpts {
  databases?: Record<string, Database>;
  schemas?: Record<string, Schema>;
  tables?: Record<string, Table>;
  fields?: Record<string, Field>;
  metrics?: Record<string, Metric>;
  segments?: Record<string, Segment>;
  questions?: Record<string, Question>;
  settings?: Settings;
}

/**
 * @deprecated The class shouldn't be used for anything but to create a MetadataProvider instance from MBQL lib.
 *
 *   For finding a database/table/field/card by id, use the corresponding RTK query endpoints.
 *   Do not rely on data being implicitly loaded in some other place.
 */
class Metadata {
  databases: Record<string, Database> = {};
  schemas: Record<string, Schema> = {};
  tables: Record<string, Table> = {};
  fields: Record<string, Field> = {};
  metrics: Record<string, Metric> = {};
  segments: Record<string, Segment> = {};
  questions: Record<string, Question> = {};
  settings?: Settings;

  constructor(opts?: MetadataOpts) {
    Object.assign(this, opts);
  }

  /**
   * @deprecated load data via RTK Query - useListDatabasesQuery
   */
  databasesList({ savedQuestions = true } = {}): Database[] {
    return _.chain(this.databases)
      .values()
      .filter(db => savedQuestions || !db.is_saved_questions)
      .sortBy(db => db.name)
      .value();
  }

  /**
   * @deprecated load data via RTK Query - useListDatabaseSchemaTablesQuery
   */
  tablesList(): Table[] {
    return Object.values(this.tables);
  }

  /**
   * @deprecated load data via RTK Query - useListFieldsQuery
   */
  fieldsList(): Field[] {
    return Object.values(this.fields);
  }

  /**
   * @deprecated load data via RTK Query - useListMetricsQuery
   */
  metricsList(): Metric[] {
    return Object.values(this.metrics);
  }

  /**
   * @deprecated load data via RTK Query - useListSegmentsQuery
   */
  segmentsList(): Segment[] {
    return Object.values(this.segments);
  }

  /**
   * @deprecated load data via RTK Query - useGetSegmentQuery
   */
  segment(segmentId: SegmentId | undefined | null): Segment | null {
    return (segmentId != null && this.segments[segmentId]) || null;
  }

  /**
   * @deprecated load data via RTK Query - useGetMetricQuery
   */
  metric(metricId: MetricId | undefined | null): Metric | null {
    return (metricId != null && this.metrics[metricId]) || null;
  }

  /**
   * @deprecated load data via RTK Query - useGetDatabaseQuery
   */
  database(databaseId: DatabaseId | undefined | null): Database | null {
    return (databaseId != null && this.databases[databaseId]) || null;
  }

  /**
   * @deprecated load data via RTK Query - useListDatabasesQuery({ saved: true })
   */
  savedQuestionsDatabase() {
    return this.databases[SAVED_QUESTIONS_VIRTUAL_DB_ID];
  }

  /**
   * @deprecated load data via RTK Query - useListSchemasQuery or useListDatabaseSchemaTablesQuery
   */
  schema(schemaId: SchemaId | undefined | null): Schema | null {
    return (schemaId != null && this.schemas[schemaId]) || null;
  }

  /**
   * @deprecated load data via RTK Query - useGetTableQuery or useGetTableMetadataQuery
   */
  table(tableId: TableId | undefined | null): Table | null {
    return (tableId != null && this.tables[tableId]) || null;
  }

  /**
   * @deprecated load data via RTK Query - useGetFieldQuery
   */
  field(
    fieldId: FieldId | FieldReference | string | undefined | null,
    tableId?: TableId | undefined | null,
  ): Field | null {
    if (fieldId == null) {
      return null;
    }

    const uniqueId = getUniqueFieldId({
      id: fieldId,
      name: "",
      table_id: tableId ?? undefined,
    });

    return this.fields[uniqueId] || null;
  }

  /**
   * @deprecated load data via RTK Query - useGetCardQuery
   */
  question(cardId: CardId | undefined | null): Question | null {
    return (cardId != null && this.questions[cardId]) || null;
  }

  setting<T extends SettingKey>(key: T): Settings[T] | null {
    return this.settings ? this.settings[key] : null;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Metadata;
