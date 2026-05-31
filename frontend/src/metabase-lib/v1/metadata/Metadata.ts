import _ from "underscore";

import { MetadataSymbol } from "metabase-lib";
import type {
  Card,
  DatabaseId,
  FieldId,
  FieldReference,
  Measure,
  MeasureId,
  Metric,
  NativeQuerySnippet,
  NormalizedDatabase,
  NormalizedField,
  NormalizedMeasure,
  NormalizedMetric,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
  SchemaId,
  Segment,
  SettingKey,
  Settings,
  TableId,
} from "metabase-types/api";

import Question from "../Question";

import Database from "./Database";
import Field from "./Field";
import type Schema from "./Schema";
import Table from "./Table";
import { getUniqueFieldId } from "./utils/fields";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "./utils/saved-questions";

/**
 * The raw, un-wrapped records `Metadata` is built from. These are the plain
 * api/normalized shapes as they come out of the RTK Query caches (or, for now,
 * the legacy normalizr store) — no cross-linking, no wrapper instances.
 */
interface MetadataInput {
  databases?: Record<string, NormalizedDatabase>;
  schemas?: Record<string, NormalizedSchema>;
  tables?: Record<string, NormalizedTable>;
  fields?: Record<string, NormalizedField>;
  segments?: Record<string, NormalizedSegment>;
  measures?: Record<string, NormalizedMeasure>;
  metrics?: Record<string, NormalizedMetric>;
  questions?: Record<string, Card>;
  snippets?: Record<string, NativeQuerySnippet>;
  settings?: Settings;
}

function rekeyFieldsByUniqueId(
  fields: Record<string, NormalizedField>,
): Record<string, NormalizedField> {
  const byUniqueId: Record<string, NormalizedField> = {};
  for (const field of Object.values(fields)) {
    // remove stub field instances created for field values without field properties
    const uniqueId = field.uniqueId ?? getUniqueFieldId(field);
    if (uniqueId != null) {
      byUniqueId[uniqueId] = field;
    }
  }
  return byUniqueId;
}

/**
 * @deprecated The class shouldn't be used for anything but to create a MetadataProvider instance from MBQL lib.
 *
 *   For finding a database/table/field/card by id, use the corresponding RTK query endpoints.
 *   Do not rely on data being implicitly loaded in some other place.
 *
 * Wrapper instances and their cross-links (`table.fields`, `field.target`, …)
 * are built lazily on first access and memoized for the life of this instance,
 * so constructing a `Metadata` is cheap regardless of how much is cached — only
 * the slices a consumer actually touches get wrapped and linked.
 */
class Metadata {
  // We brand this type with the MetadataSymbol to
  // to mark it as a Metadata instance.
  readonly [MetadataSymbol]?: void;

  settings?: Settings;

  private readonly _rawDatabases: Record<string, NormalizedDatabase>;
  private readonly _rawSchemas: Record<string, NormalizedSchema>;
  private readonly _rawTables: Record<string, NormalizedTable>;
  private readonly _rawFields: Record<string, NormalizedField>;
  private readonly _rawSegments: Record<string, NormalizedSegment>;
  private readonly _rawMeasures: Record<string, NormalizedMeasure>;
  private readonly _rawMetrics: Record<string, NormalizedMetric>;
  private readonly _rawQuestions: Record<string, Card>;
  private readonly _snippets: Record<string, NativeQuerySnippet>;

  private readonly _databaseCache = new Map<string, Database>();
  private readonly _schemaCache = new Map<string, Schema>();
  private readonly _tableCache = new Map<string, Table>();
  private readonly _fieldCache = new Map<string, Field>();
  private readonly _segmentCache = new Map<string, Segment>();
  private readonly _measureCache = new Map<string, Measure>();
  private readonly _metricCache = new Map<string, Metric>();
  private readonly _questionCache = new Map<string, Question>();

  private _databasesAll?: Record<string, Database>;
  private _schemasAll?: Record<string, Schema>;
  private _tablesAll?: Record<string, Table>;
  private _fieldsAll?: Record<string, Field>;
  private _segmentsAll?: Record<string, Segment>;
  private _measuresAll?: Record<string, Measure>;
  private _metricsAll?: Record<string, Metric>;
  private _questionsAll?: Record<string, Question>;

  constructor(input: MetadataInput | Metadata = {}) {
    if (input instanceof Metadata) {
      // Cloning an existing Metadata: reuse its raw records. Wrapper caches are
      // intentionally not copied so the clone rebuilds lazily (and any caller
      // mutating raw records, e.g. snippets, gets a fresh view).
      this.settings = input.settings;
      this._rawDatabases = input._rawDatabases;
      this._rawSchemas = input._rawSchemas;
      this._rawTables = input._rawTables;
      this._rawFields = input._rawFields;
      this._rawSegments = input._rawSegments;
      this._rawMeasures = input._rawMeasures;
      this._rawMetrics = input._rawMetrics;
      this._rawQuestions = input._rawQuestions;
      this._snippets = { ...input._snippets };
      return;
    }

    this.settings = input.settings;
    this._rawDatabases = input.databases ?? {};
    this._rawSchemas = input.schemas ?? {};
    this._rawTables = input.tables ?? {};
    this._rawFields = rekeyFieldsByUniqueId(input.fields ?? {});
    this._rawSegments = input.segments ?? {};
    this._rawMeasures = input.measures ?? {};
    this._rawMetrics = input.metrics ?? {};
    this._rawQuestions = input.questions ?? {};
    this._snippets = input.snippets ?? {};
  }

  // ---------------------------------------------------------------------------
  // Lazy, memoized record maps (back-compat with consumers that read the whole
  // map, e.g. `provideFieldListTags(metadata.fields)`). Reading one of these
  // materializes every wrapper of that kind — prefer the `*List()` helpers or
  // the by-id accessors when you only need a slice.
  // ---------------------------------------------------------------------------

  get databases(): Record<string, Database> {
    return (this._databasesAll ??= this._materialize(this._rawDatabases, (id) =>
      this.database(id),
    ));
  }

  get schemas(): Record<string, Schema> {
    return (this._schemasAll ??= this._materialize(this._rawSchemas, (id) =>
      this.schema(id),
    ));
  }

  get tables(): Record<string, Table> {
    return (this._tablesAll ??= this._materialize(this._rawTables, (id) =>
      this.table(id),
    ));
  }

  get fields(): Record<string, Field> {
    return (this._fieldsAll ??= this._materialize(this._rawFields, (uniqueId) =>
      this._field(uniqueId),
    ));
  }

  get segments(): Record<string, Segment> {
    return (this._segmentsAll ??= this._materialize(this._rawSegments, (id) =>
      this.segment(id),
    ));
  }

  get measures(): Record<string, Measure> {
    return (this._measuresAll ??= this._materialize(this._rawMeasures, (id) =>
      this.measure(id),
    ));
  }

  get metrics(): Record<string, Metric> {
    return (this._metricsAll ??= this._materialize(this._rawMetrics, (id) =>
      this.metric(id),
    ));
  }

  get questions(): Record<string, Question> {
    return (this._questionsAll ??= this._materialize(this._rawQuestions, (id) =>
      this.question(Number(id)),
    ));
  }

  get snippets(): Record<string, NativeQuerySnippet> {
    return this._snippets;
  }

  // Setters let callers replace a whole wrapped map explicitly (mainly tests and
  // the cljs metadata-provider bridge); otherwise maps materialize lazily.
  set databases(value: Record<string, Database>) {
    this._databasesAll = value;
  }

  set schemas(value: Record<string, Schema>) {
    this._schemasAll = value;
  }

  set tables(value: Record<string, Table>) {
    this._tablesAll = value;
  }

  set fields(value: Record<string, Field>) {
    this._fieldsAll = value;
  }

  set segments(value: Record<string, Segment>) {
    this._segmentsAll = value;
  }

  set measures(value: Record<string, Measure>) {
    this._measuresAll = value;
  }

  set metrics(value: Record<string, Metric>) {
    this._metricsAll = value;
  }

  set questions(value: Record<string, Question>) {
    this._questionsAll = value;
  }

  private _materialize<T>(
    rawStore: Record<string, unknown>,
    // ids are widened to `any` so callers can hand the string key straight to
    // accessors typed with numeric id parameters.
    build: (id: any) => T | null,
  ): Record<string, T> {
    const result: Record<string, T> = {};
    for (const id of Object.keys(rawStore)) {
      const value = build(id);
      if (value != null) {
        result[id] = value;
      }
    }
    return result;
  }

  /**
   * @deprecated load data via RTK Query - useListDatabasesQuery
   */
  databasesList({ savedQuestions = true } = {}): Database[] {
    return _.chain(this.databases)
      .values()
      .filter((db) => savedQuestions || !db.is_saved_questions)
      .sortBy((db) => db.name)
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
   * @deprecated load data via RTK Query - useListMeasuresQuery
   */
  measuresList(): Measure[] {
    return Object.values(this.measures);
  }

  /**
   * @deprecated load data via RTK Query - useGetMeasureQuery
   */
  measure(measureId: MeasureId | undefined | null): Measure | null {
    if (measureId == null) {
      return null;
    }
    const cached = this._measureCache.get(String(measureId));
    if (cached) {
      return cached;
    }
    const raw = this._rawMeasures[measureId];
    if (!raw) {
      return null;
    }
    const { table: _table, ...rest } = raw;
    const measure = rest as Measure;
    this._measureCache.set(String(measureId), measure);
    return measure;
  }

  metric(metricId: NormalizedMetric["id"] | undefined | null): Metric | null {
    if (metricId == null) {
      return null;
    }
    const cached = this._metricCache.get(String(metricId));
    if (cached) {
      return cached;
    }
    const raw = this._rawMetrics[metricId];
    if (!raw) {
      return null;
    }
    const { collection: _collection, ...rest } = raw;
    const metric = { ...rest, collection: null } as Metric;
    this._metricCache.set(String(metricId), metric);
    return metric;
  }

  /**
   * @deprecated load data via RTK Query - useGetDatabaseQuery
   */
  database(databaseId: DatabaseId | undefined | null): Database | null {
    if (databaseId == null) {
      return null;
    }
    const cached = this._databaseCache.get(String(databaseId));
    if (cached) {
      return cached;
    }
    const raw = this._rawDatabases[databaseId];
    if (!raw) {
      return null;
    }
    const instance = new Database(raw);
    instance.metadata = this;
    this._databaseCache.set(String(databaseId), instance);
    return instance;
  }

  /**
   * @deprecated load data via RTK Query - useListDatabasesQuery({ saved: true })
   */
  savedQuestionsDatabase() {
    return this.database(SAVED_QUESTIONS_VIRTUAL_DB_ID) ?? undefined;
  }

  /**
   * @deprecated load data via RTK Query - useListSchemasQuery or useListDatabaseSchemaTablesQuery
   */
  schema(schemaId: SchemaId | undefined | null): Schema | null {
    if (schemaId == null) {
      return null;
    }
    const cached = this._schemaCache.get(String(schemaId));
    if (cached) {
      return cached;
    }
    const raw = this._rawSchemas[schemaId];
    if (!raw) {
      return null;
    }
    const schema = this._wrapSchema(raw);
    this._schemaCache.set(String(schemaId), schema);
    return schema;
  }

  private _wrapSchema(raw: NormalizedSchema): Schema {
    const metadata = this;
    const { database: databaseId, tables: tableIds, ...rest } = raw;
    const schema = { ...rest, metadata } as Schema;

    let database: Database | undefined;
    let databaseResolved = false;
    Object.defineProperty(schema, "database", {
      enumerable: true,
      configurable: true,
      get() {
        if (!databaseResolved) {
          database = metadata.database(databaseId) ?? undefined;
          databaseResolved = true;
        }
        return database;
      },
    });

    let tables: Table[] | undefined;
    Object.defineProperty(schema, "tables", {
      enumerable: true,
      configurable: true,
      get() {
        if (tables) {
          return tables;
        }
        if (tableIds) {
          tables = tableIds
            .map((id) => metadata.table(id))
            .filter((table): table is Table => table != null);
        } else if (schema.database && schema.database.getTables().length > 0) {
          tables = schema.database
            .getTables()
            .filter((table) => table.schema_name === schema.name);
        } else {
          tables = metadata
            .tablesList()
            .filter((table) => table.schema && table.schema.id === schema.id);
        }
        return tables;
      },
    });

    return schema;
  }

  /**
   * @deprecated load data via RTK Query - useGetTableQuery or useGetTableQueryMetadataQuery
   */
  table(tableId: TableId | undefined | null): Table | null {
    if (tableId == null) {
      return null;
    }
    const cached = this._tableCache.get(String(tableId));
    if (cached) {
      return cached;
    }
    const raw = this._rawTables[tableId];
    if (!raw) {
      return null;
    }
    const instance = new Table(raw);
    instance.metadata = this;
    this._tableCache.set(String(tableId), instance);
    return instance;
  }

  segment(segmentId: Segment["id"] | undefined | null): Segment | null {
    if (segmentId == null) {
      return null;
    }
    const cached = this._segmentCache.get(String(segmentId));
    if (cached) {
      return cached;
    }
    const raw = this._rawSegments[segmentId];
    if (!raw) {
      return null;
    }
    const { table: _table, ...rest } = raw;
    const segment = rest as Segment;
    this._segmentCache.set(String(segmentId), segment);
    return segment;
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

    return this._field(uniqueId);
  }

  private _field(uniqueId: number | string): Field | null {
    const cached = this._fieldCache.get(String(uniqueId));
    if (cached) {
      return cached;
    }
    const raw = this._rawFields[uniqueId];
    if (!raw) {
      return null;
    }
    // We need a way to distinguish field objects that come from the server
    // vs. those that are created client-side to handle lossy transformations
    // between Field instances and FieldDimension instances.
    const instance = new Field({ ...raw, _comesFromEndpoint: true });
    instance.metadata = this;
    this._fieldCache.set(String(uniqueId), instance);
    return instance;
  }

  /**
   * @deprecated load data via RTK Query - useGetCardQuery
   */
  question(cardId: Card["id"] | string | undefined | null): Question | null {
    if (cardId == null) {
      return null;
    }

    if (typeof cardId === "number") {
      const cached = this._questionCache.get(String(cardId));
      if (cached) {
        return cached;
      }
      const raw = this._rawQuestions[cardId];
      if (!raw) {
        return null;
      }
      const question = new Question(raw, this);
      this._questionCache.set(String(cardId), question);
      return question;
    }

    // TODO: move loadCard in QB to use RTK Query
    if (typeof cardId === "string") {
      for (const numericId in this._rawQuestions) {
        if (this._rawQuestions[numericId]?.entity_id === cardId) {
          return this.question(Number(numericId));
        }
      }
    }

    return null;
  }

  setting<T extends SettingKey>(key: T): Settings[T] | null {
    return this.settings ? this.settings[key] : null;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Metadata;
