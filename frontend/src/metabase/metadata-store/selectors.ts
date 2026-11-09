import { createSelector } from "@reduxjs/toolkit";
import { normalize } from "normalizr";

import type { EntitiesState, State } from "metabase/redux/store";
import { getSettings } from "metabase/settings";
import { formatField } from "metabase/utils/formatting";
import type { JsMetadata } from "metabase-lib";
import { getUniqueFieldId } from "metabase-lib/v1/metadata/utils/fields";
import type {
  DatabaseId,
  FieldId,
  FieldReference,
  NormalizedDatabase,
  NormalizedField,
  NormalizedForeignKey,
  NormalizedSchema,
  NormalizedTable,
  SchemaId,
  TableId,
} from "metabase-types/api";

import { type FieldEntity, FieldSchema } from "./schema";

/**
 * The slice these selectors read. Naming it here rather than taking the global
 * `State` keeps the shape this module depends on explicit, and lets a caller
 * that holds only the mirror use them.
 */
type MetadataState = { entities: EntitiesState };

type TableSelectorOpts = {
  includeHiddenTables?: boolean;
};

type FieldSelectorOpts = {
  includeSensitiveFields?: boolean;
};

export type MetadataSelectorOpts = TableSelectorOpts & FieldSelectorOpts;

const getNormalizedDatabases = (state: MetadataState) =>
  state.entities.databases;
const getNormalizedSchemas = (state: MetadataState) => state.entities.schemas;

const getNormalizedTablesUnfiltered = (state: MetadataState) =>
  state.entities.tables;

const getIncludeHiddenTables = (
  _state: MetadataState,
  props?: TableSelectorOpts,
) => !!props?.includeHiddenTables;

const getNormalizedTables = createSelector(
  [getNormalizedTablesUnfiltered, getIncludeHiddenTables],
  (tables, includeHiddenTables) =>
    includeHiddenTables
      ? tables
      : Object.fromEntries(
          Object.entries(tables).filter(
            ([, table]) => table.visibility_type == null,
          ),
        ),
);

const getNormalizedFieldsUnfiltered = (state: MetadataState) =>
  state.entities.fields;
const getIncludeSensitiveFields = (
  _state: MetadataState,
  props?: FieldSelectorOpts,
) => !!props?.includeSensitiveFields;

const getNormalizedFields = createSelector(
  [
    getNormalizedFieldsUnfiltered,
    getNormalizedTablesUnfiltered,
    getIncludeHiddenTables,
    getIncludeSensitiveFields,
  ],
  (fields, tables, includeHiddenTables, includeSensitiveFields) =>
    Object.fromEntries(
      Object.entries(fields).filter(([, field]) => {
        const table = tables[field.table_id];

        const shouldIncludeTable =
          !table || table.visibility_type == null || includeHiddenTables;

        const shouldIncludeField =
          field.visibility_type !== "sensitive" || includeSensitiveFields;

        return shouldIncludeTable && shouldIncludeField;
      }),
    ),
);

const getNormalizedSegments = (state: MetadataState) => state.entities.segments;
const getNormalizedMeasures = (state: MetadataState) =>
  state.entities.measures ?? {};
const getNormalizedMetrics = (state: MetadataState) =>
  state.entities.metrics ?? {};
const getNormalizedQuestions = (state: MetadataState) =>
  state.entities.questions;
const getNormalizedSnippets = (state: MetadataState) => state.entities.snippets;

export const getShallowDatabases = getNormalizedDatabases;
export const getShallowTables = getNormalizedTables;
export const getShallowFields = getNormalizedFields;
export const getShallowSegments = getNormalizedSegments;
export const getShallowSchemas = getNormalizedSchemas;
export const getShallowQuestions = getNormalizedQuestions;

const getVisibleTable = (state: MetadataState, tableId: TableId) =>
  getNormalizedTables(state)[tableId];

const getVisibleFields = (state: MetadataState) => getNormalizedFields(state);

// Field values can arrive before the field itself, which leaves a stub record
// with no `uniqueId`. `getMetadata` drops those.
const isResolvedField = (
  field: NormalizedField | undefined,
): field is NormalizedField => field?.uniqueId != null;

/**
 * The ids of a table's fields, as `getMetadata` resolves `Table.fields`: the
 * table's `original_fields` when it has them, otherwise its visible fields.
 */
export const getShallowTableFieldIds = createSelector(
  [getVisibleTable, getVisibleFields],
  (table, fields): FieldId[] => {
    if (table == null) {
      return [];
    }
    if (table.original_fields) {
      return table.original_fields.map((field) => field.id);
    }
    return (table.fields ?? [])
      .map((fieldKey) => fields[fieldKey])
      .filter(isResolvedField)
      .map((field) => field.id);
  },
);

export type ShallowForeignKey = Omit<NormalizedForeignKey, "origin"> & {
  origin: NormalizedField;
};

/**
 * A table's foreign keys whose origin field is visible, with that field in
 * place of its id. `undefined` until the table's foreign keys are loaded.
 */
export const getShallowTableForeignKeys = createSelector(
  [getVisibleTable, getVisibleFields],
  (table, fields): ShallowForeignKey[] | undefined =>
    table?.fks?.flatMap((foreignKey) => {
      const origin = fields[foreignKey.origin_id];
      return isResolvedField(origin) ? [{ ...foreignKey, origin }] : [];
    }),
);

const getMetadataForOpts = createSelector(
  [
    getNormalizedDatabases,
    getNormalizedTables,
    getNormalizedFields,
    getNormalizedSegments,
    getNormalizedMeasures,
    getNormalizedMetrics,
    getNormalizedQuestions,
    getNormalizedSnippets,
    getSettings,
  ],
  (
    databases,
    tables,
    fields,
    segments,
    measures,
    metrics,
    questions,
    snippets,
    settings,
  ) => ({
    databases,
    tables,
    fields: Object.fromEntries(
      Object.entries(fields).filter(([, field]) => isResolvedField(field)),
    ),
    segments,
    measures,
    metrics,
    questions,
    snippets,
    settings,
  }),
);

function toJsMetadata(
  metadata: ReturnType<typeof getMetadataForOpts>,
): JsMetadata {
  // JsMetadata is opaque so that only metabase-lib reads the store records
  return metadata as unknown as JsMetadata;
}

const NO_OPTS: MetadataSelectorOpts = {};

/**
 * Reselect keys its cache on the argument list, so `getMetadata(state)` and
 * `getMetadata(state, undefined)` would build two objects over the same
 * records, and with them two sets of metabase-lib caches. Callers use both
 * shapes, so the options are canonicalised here.
 */
export const getMetadata = (
  state: State,
  props: MetadataSelectorOpts = NO_OPTS,
): JsMetadata => toJsMetadata(getMetadataForOpts(state, props));

const UNFILTERED_OPTS: MetadataSelectorOpts = {
  includeHiddenTables: true,
  includeSensitiveFields: true,
};

export const getMetadataUnfiltered = (state: State) =>
  getMetadata(state, UNFILTERED_OPTS);

function getDatabaseTables(
  databaseId: DatabaseId,
  databases: Record<string, NormalizedDatabase>,
  tables: Record<string, NormalizedTable>,
): NormalizedTable[] {
  const tableIds = databases[databaseId]?.tables ?? [];
  if (tableIds.length > 0) {
    return tableIds.map((tableId) => tables[tableId]).filter(isNotNull);
  }
  return Object.values(tables).filter(
    (table) => table.schema != null && table.db_id === databaseId,
  );
}

/**
 * A lookup from a database id to its schemas.
 */
export const getShallowDatabaseSchemas = createSelector(
  [getNormalizedDatabases, getNormalizedSchemas],
  (databases, schemas) =>
    (databaseId: DatabaseId): NormalizedSchema[] => {
      const database = databases[databaseId];
      if (database == null) {
        return [];
      }
      if (database.schemas) {
        return database.schemas
          .map((schemaId) => schemas[schemaId])
          .filter(isNotNull);
      }
      return Object.values(schemas).filter(
        (schema) => schema.database === databaseId,
      );
    },
);

/**
 * A lookup from a database id to its tables.
 */
export const getShallowDatabaseTables = createSelector(
  [getNormalizedDatabases, getNormalizedTables],
  (databases, tables) =>
    (databaseId: DatabaseId): NormalizedTable[] =>
      databases[databaseId] != null
        ? getDatabaseTables(databaseId, databases, tables)
        : [],
);

/**
 * A lookup from a schema id to its tables.
 */
export const getShallowSchemaTables = createSelector(
  [getNormalizedDatabases, getNormalizedSchemas, getNormalizedTables],
  (databases, schemas, tables) =>
    (schemaId: SchemaId): NormalizedTable[] => {
      const schema = schemas[schemaId];
      if (schema == null) {
        return [];
      }
      if (schema.tables) {
        return schema.tables
          .map((tableId) => tables[tableId])
          .filter(isNotNull);
      }
      const databaseId = schema.database;
      const databaseTables =
        databaseId != null && databases[databaseId] != null
          ? getDatabaseTables(databaseId, databases, tables)
          : [];
      if (databaseTables.length > 0) {
        return databaseTables.filter(
          (table) => table.schema_name === schema.name,
        );
      }
      return Object.values(tables).filter((table) => table.schema === schemaId);
    },
);

/**
 * A lookup from a table id to the schema it belongs to. A table the store does
 * not hold, and a schema it has not loaded, both give nothing.
 */
export const getShallowTableSchema = createSelector(
  [getNormalizedTables, getNormalizedSchemas],
  (tables, schemas) =>
    (tableId: TableId): NormalizedSchema | undefined => {
      const schemaId = tables[tableId]?.schema;
      return schemaId != null ? schemas[schemaId] : undefined;
    },
);

/**
 * A lookup from a table id to its fields.
 */
export const getShallowTableFields = createSelector(
  [getNormalizedTables, getNormalizedFields],
  (tables, fields) =>
    (tableId: TableId): NormalizedField[] => {
      const table = tables[tableId];
      if (table == null) {
        return [];
      }
      if (table.original_fields) {
        return table.original_fields
          .map((apiField) => {
            // normalizing a single field always stores it under `result`
            const { entities, result } = normalize<
              FieldEntity,
              Pick<State["entities"], "fields">
            >(apiField, FieldSchema);
            return entities.fields?.[result];
          })
          .filter(isNotNull);
      }
      return (table.fields ?? [])
        .map((fieldKey) => fields[fieldKey])
        .filter(isResolvedField);
    },
);

/**
 * A lookup from a field id, or a field reference, to the field.
 */
export const getShallowFieldById = createSelector(
  [getNormalizedFields],
  (fields) =>
    (fieldId: FieldId | FieldReference): NormalizedField | undefined => {
      const field = fields[getUniqueFieldId({ id: fieldId })];
      return isResolvedField(field) ? field : undefined;
    },
);

/**
 * A lookup from a field to its name, with the names of its parents for a
 * nested field. A field the store does not hold keeps its own `display_name`.
 */
export const getShallowFieldName = createSelector(
  [getNormalizedFields],
  (fields) =>
    (
      field: Pick<NormalizedField, "id" | "table_id" | "display_name">,
    ): string => {
      const storeField = fields[getUniqueFieldId({ id: field.id })];
      if (!isResolvedField(storeField)) {
        return field.display_name;
      }
      const path: NormalizedField[] = [];
      let current: NormalizedField | undefined = storeField;
      while (current != null) {
        path.unshift(current);
        current =
          current.parent_id != null
            ? fields[getUniqueFieldId({ id: current.parent_id })]
            : undefined;
      }
      return path.map(formatField).join(": ");
    },
);

function isNotNull<T>(value: T | null | undefined): value is T {
  return value != null;
}
