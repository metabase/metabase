import { createSelector } from "@reduxjs/toolkit";
import { normalize } from "normalizr";

import type { State } from "metabase/redux/store";
import { FieldSchema } from "metabase/schema";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import type { NormalizedField, NormalizedTable } from "metabase-types/api";

import { getSettings } from "./settings";

type TableSelectorOpts = {
  includeHiddenTables?: boolean;
};

type FieldSelectorOpts = {
  includeSensitiveFields?: boolean;
};

export type MetadataSelectorOpts = TableSelectorOpts & FieldSelectorOpts;

const getNormalizedDatabases = (state: State) => state.entities.databases;
const getNormalizedSchemas = (state: State) => state.entities.schemas;

const getNormalizedTablesUnfiltered = (state: State) => state.entities.tables;

const getIncludeHiddenTables = (_state: State, props?: TableSelectorOpts) =>
  !!props?.includeHiddenTables;

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

const getNormalizedFieldsUnfiltered = (state: State) => state.entities.fields;
const getIncludeSensitiveFields = (_state: State, props?: FieldSelectorOpts) =>
  !!props?.includeSensitiveFields;

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

const getNormalizedSegments = (state: State) => state.entities.segments;
const getNormalizedMeasures = (state: State) => state.entities.measures ?? {};
const getNormalizedMetrics = (state: State) => state.entities.metrics ?? {};
const getNormalizedQuestions = (state: State) => state.entities.questions;
const getNormalizedSnippets = (state: State) => state.entities.snippets;

export const getShallowDatabases = getNormalizedDatabases;
export const getShallowTables = getNormalizedTables;
export const getShallowFields = getNormalizedFields;
export const getShallowSegments = getNormalizedSegments;

/**
 * Some tables arrive with their fields denormalized under `original_fields`
 * (e.g. from card/dashboard query_metadata). Flatten those into the fields map
 * keyed by uniqueId so `Metadata` can resolve them uniformly, and point the
 * table's `fields` at the resulting uniqueIds. This is the one bit of normalizr
 * left, and it lives here in the app layer rather than in metabase-lib.
 */
function flattenOriginalFields(
  tables: Record<string, NormalizedTable>,
  fields: Record<string, NormalizedField>,
): {
  tables: Record<string, NormalizedTable>;
  fields: Record<string, NormalizedField>;
} {
  const hasOriginalFields = Object.values(tables).some(
    (table) => table.original_fields,
  );
  if (!hasOriginalFields) {
    return { tables, fields };
  }

  const flattenedFields: Record<string, NormalizedField> = { ...fields };
  const flattenedTables: Record<string, NormalizedTable> = {};

  for (const [tableId, table] of Object.entries(tables)) {
    if (!table.original_fields) {
      flattenedTables[tableId] = table;
      continue;
    }

    const fieldIds = table.original_fields.map((apiField) => {
      const { entities, result } = normalize(apiField, FieldSchema);
      Object.assign(flattenedFields, entities.fields);
      return result;
    });

    flattenedTables[tableId] = { ...table, fields: fieldIds };
  }

  return { tables: flattenedTables, fields: flattenedFields };
}

export const getMetadata: (
  state: State,
  props?: MetadataSelectorOpts,
) => Metadata = createSelector(
  [
    getNormalizedDatabases,
    getNormalizedSchemas,
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
    schemas,
    tables,
    fields,
    segments,
    measures,
    metrics,
    questions,
    snippets,
    settings,
  ) => {
    const flattened = flattenOriginalFields(tables, fields);
    return new Metadata({
      databases,
      schemas,
      tables: flattened.tables,
      fields: flattened.fields,
      segments,
      measures,
      metrics,
      questions,
      snippets,
      settings,
    });
  },
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
