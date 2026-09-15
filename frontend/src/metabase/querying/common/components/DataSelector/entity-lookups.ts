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
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

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
  field: DataSelectorFieldLookup;
  databaseSchemas: (databaseId: DatabaseId) => DataSelectorSchema[];
  databaseTables: (databaseId: DatabaseId) => DataSelectorTable[];
  schemaTables: (schemaId: SchemaId) => DataSelectorTable[];
  tableSchema: (tableId: TableId) => DataSelectorSchema | undefined;
  tableFields: (tableId: TableId) => DataSelectorField[];
  fieldName: (field: DataSelectorField) => string;
};

type DataSelectorFieldLookup = ReturnType<typeof getShallowFieldById>;

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
    table: (id) => (id != null ? tables[id] : undefined),
    field,
    databaseSchemas,
    databaseTables,
    schemaTables,
    tableSchema,
    tableFields,
    fieldName,
  }),
);

export const getEntityLookups = (state: State): EntityLookups =>
  selectEntityLookups(state);
