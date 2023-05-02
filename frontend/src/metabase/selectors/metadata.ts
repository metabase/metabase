import { createSelector } from "@reduxjs/toolkit";
import type { Table } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Metadata from "metabase-lib/metadata/Metadata";
import createMetadata from "metabase-lib/metadata/createMetadata";

type TableSelectorOpts =
  | {
      includeHiddenTables?: boolean;
    }
  | undefined;

type FieldSelectorOpts =
  | {
      includeSensitiveFields?: boolean;
    }
  | undefined;

export const getNormalizedDatabases = (state: State) =>
  state.entities.databases;
export const getNormalizedSchemas = (state: State) => state.entities.schemas;

const getNormalizedTablesUnfiltered = (state: State) => state.entities.tables;

const getIncludeHiddenTables = (_state: State, props?: TableSelectorOpts) =>
  !!props?.includeHiddenTables;

const getNormalizedTables = createSelector(
  [getNormalizedTablesUnfiltered, getIncludeHiddenTables],
  (tables, includeHiddenTables) =>
    includeHiddenTables
      ? tables
      : filterValues(tables, (table: Table) => table.visibility_type == null),
);

const getNormalizedFieldsUnfiltered = (state: State) => state.entities.fields;
const getIncludeSensitiveFields = (_state: State, props: FieldSelectorOpts) =>
  !!props?.includeSensitiveFields;

const getNormalizedFields = createSelector(
  [
    getNormalizedFieldsUnfiltered,
    getNormalizedTablesUnfiltered,
    getIncludeHiddenTables,
    getIncludeSensitiveFields,
  ],
  (fields, tables, includeHiddenTables, includeSensitiveFields) =>
    filterValues(fields, field => {
      const table = tables[field.table_id];

      const shouldIncludeTable =
        !table || table.visibility_type == null || includeHiddenTables;

      const shouldIncludeField =
        field.visibility_type !== "sensitive" || includeSensitiveFields;

      return shouldIncludeTable && shouldIncludeField;
    }),
);

const getNormalizedMetrics = (state: State) => state.entities.metrics;
const getNormalizedSegments = (state: State) => state.entities.segments;
const getNormalizedQuestions = (state: State) => state.entities.questions;

export const getShallowDatabases = getNormalizedDatabases;
export const getShallowTables = getNormalizedTables;
export const getShallowFields = getNormalizedFields;
export const getShallowMetrics = getNormalizedMetrics;
export const getShallowSegments = getNormalizedSegments;

export const getMetadata: (
  state: State,
  props?: TableSelectorOpts & FieldSelectorOpts,
) => Metadata = createSelector(
  [
    getNormalizedDatabases,
    getNormalizedSchemas,
    getNormalizedTables,
    getNormalizedFields,
    getNormalizedSegments,
    getNormalizedMetrics,
    getNormalizedQuestions,
  ],
  (databases, schemas, tables, fields, segments, metrics, questions) =>
    createMetadata({
      databases,
      schemas,
      tables,
      fields,
      segments,
      metrics,
      questions,
    }),
);

export const getMetadataUnfiltered = (state: State) => {
  return getMetadata(state, {
    includeHiddenTables: true,
    includeSensitiveFields: true,
  });
};

export const getMetadataWithHiddenTables = (
  state: State,
  props?: TableSelectorOpts,
) => {
  return getMetadata(state, { ...props, includeHiddenTables: true });
};

export const getDatabases = createSelector(
  [getMetadata],
  ({ databases }) => databases,
);

export const getTables = createSelector([getMetadata], ({ tables }) => tables);

export const getFields = createSelector([getMetadata], ({ fields }) => fields);

export const getMetrics = createSelector(
  [getMetadata],
  ({ metrics }) => metrics,
);

export const getSegments = createSelector(
  [getMetadata],
  ({ segments }) => segments,
);

function filterValues<T>(obj: Record<string, T>, pred: (obj: T) => boolean) {
  const filtered: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (pred(v)) {
      filtered[k] = v;
    }
  }
  return filtered;
}
