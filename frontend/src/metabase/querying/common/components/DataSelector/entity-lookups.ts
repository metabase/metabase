import { createSelector } from "@reduxjs/toolkit";

import {
  getShallowDatabaseSchemas,
  getShallowDatabaseTables,
  getShallowDatabases,
  getShallowFieldById,
  getShallowFieldName,
  getShallowSchemaTables,
  getShallowSchemas,
  getShallowTableFields,
  getShallowTableSchema,
  getShallowTables,
} from "metabase/metadata-store";
import type { State } from "metabase/redux/store";
import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
} from "metabase-types/api";
import { isRealTable, isRealTableField } from "metabase-types/guards";

import type {
  DataSelectorDatabase,
  DataSelectorField,
  DataSelectorSchema,
  DataSelectorTable,
} from "./types";

/**
 * The reads the data selector makes while it walks from a database to a field.
 * It learns each id as the user picks one, so it holds the lookups rather than
 * the records.
 */
export type EntityLookups = {
  database: (
    id: DatabaseId | null | undefined,
  ) => DataSelectorDatabase | undefined;
  schema: (id: SchemaId | null | undefined) => DataSelectorSchema | undefined;
  table: (id: TableId | null | undefined) => DataSelectorTable | undefined;
  field: (fieldId: FieldId) => DataSelectorField | undefined;
  databaseSchemas: (databaseId: DatabaseId) => DataSelectorSchema[];
  databaseTables: (databaseId: DatabaseId) => DataSelectorTable[];
  schemaTables: (schemaId: SchemaId) => DataSelectorTable[];
  tableSchema: (tableId: TableId) => DataSelectorSchema | undefined;
  tableFields: (tableId: TableId) => DataSelectorField[];
  fieldName: (field: DataSelectorField) => string;
};

export const selectEntityLookups = createSelector(
  [
    getShallowDatabases,
    getShallowSchemas,
    getShallowTables,
    getShallowDatabaseSchemas,
    getShallowDatabaseTables,
    getShallowSchemaTables,
    getShallowTableSchema,
    getShallowTableFields,
    getShallowFieldById,
    getShallowFieldName,
  ],
  (
    databases,
    schemas,
    tables,
    databaseSchemas,
    databaseTables,
    schemaTables,
    tableSchema,
    tableFields,
    field,
    fieldName,
  ): EntityLookups => ({
    database: (id) => (id != null ? databases[id] : undefined),
    schema: (id) => (id != null ? schemas[id] : undefined),
    table: (id) => {
      const table = id != null ? tables[id] : undefined;
      return table != null && isRealTable(table) ? table : undefined;
    },
    field: (fieldId) => {
      const result = field(fieldId);
      return result != null && isRealTableField(result) ? result : undefined;
    },
    databaseSchemas,
    databaseTables: (databaseId) =>
      databaseTables(databaseId).filter(isRealTable),
    schemaTables: (schemaId) => schemaTables(schemaId).filter(isRealTable),
    tableSchema,
    tableFields: (tableId) => tableFields(tableId).filter(isRealTableField),
    fieldName,
  }),
);

export const getEntityLookups = (state: State): EntityLookups =>
  selectEntityLookups(state);
