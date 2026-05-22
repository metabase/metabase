import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";

import type { State } from "metabase/redux/store";
import {
  getShallowDatabases as getDatabases,
  getShallowFields as getFields,
  getShallowSegments as getSegments,
  getShallowTables as getTables,
} from "metabase/selectors/metadata";
import type {
  Card,
  NormalizedField,
  NormalizedTable,
} from "metabase-types/api";

import type {
  StubbedDatabase,
  StubbedField,
  StubbedSegment,
  StubbedTable,
} from "./types";
import { idsToObjectMap } from "./utils";

export interface ReferenceRouteParams {
  segmentId?: string;
  databaseId?: string;
  tableId?: string;
  fieldId?: string;
}

export interface ReferenceRouteProps {
  params: ReferenceRouteParams;
}

interface ReferenceSliceState {
  isLoading: boolean;
  error: unknown;
  isEditing: boolean;
  isFormulaExpanded: boolean;
}

// The `reference` and `revisions` slices are wired in via `reducers-main.ts`
// but aren't declared on the global `State` type. Adding them centrally
// triggers a TS2589 ("excessively deep") cascade in dashboard's reducers,
// so we widen locally here instead.
export type StateWithReference = State & {
  reference: ReferenceSliceState;
  revisions?: Record<string, Record<string | number, unknown>>;
};

export const getUser = (state: StateWithReference) => state.currentUser;

export const getSegmentId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.segmentId ?? "");
export const getSegment = createSelector(
  [getSegmentId, getSegments],
  (segmentId, segments): StubbedSegment =>
    segments?.[segmentId] || { id: segmentId },
);

export const getDatabaseId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.databaseId ?? "");

export const getDatabase = createSelector(
  [getDatabaseId, getDatabases],
  (databaseId, databases): StubbedDatabase =>
    databases?.[databaseId] || { id: databaseId },
);

export const getTableId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.tableId ?? "");
// export const getTableId = (state, props) => Number.parseInt(props.params.tableId);
export const getTablesByDatabase = createSelector(
  [getTables, getDatabase],
  (tables, database) =>
    tables && database.tables
      ? idsToObjectMap(database.tables, tables)
      : ({} as Record<string, NormalizedTable>),
);
export const getTableBySegment = createSelector(
  [getSegment, getTables],
  (segment, tables): StubbedTable =>
    segment.table_id && tables?.[segment.table_id]
      ? tables[segment.table_id]
      : { id: 0 },
);
export const getTable = createSelector(
  [getTableId, getTables, getSegmentId, getTableBySegment],
  (tableId, tables, segmentId, tableBySegment): StubbedTable =>
    tableId
      ? tables?.[tableId] || { id: tableId }
      : segmentId
        ? tableBySegment
        : { id: 0 },
);

export const getFieldId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.fieldId ?? "");
export const getFieldsByTable = createSelector(
  [getTable, getFields],
  (table, fields) =>
    table.fields
      ? idsToObjectMap(table.fields, fields)
      : ({} as Record<string, NormalizedField>),
);
export const getFieldsBySegment = createSelector(
  [getTableBySegment, getFields],
  (table, fields) =>
    table.fields
      ? idsToObjectMap(table.fields, fields)
      : ({} as Record<string, NormalizedField>),
);
export const getField = createSelector(
  [getFieldId, getFields],
  (fieldId, fields): StubbedField => fields?.[fieldId] || { id: fieldId },
);
export const getFieldBySegment = createSelector(
  [getFieldId, getFieldsBySegment],
  (fieldId, fields): StubbedField => fields[fieldId] || { id: fieldId },
);

const getQuestions = (state: StateWithReference) =>
  getIn(state, ["entities", "questions"]) || {};

const getRevisions = (state: StateWithReference) => state.revisions;

export const getSegmentRevisions = createSelector(
  [getSegmentId, getRevisions],
  (segmentId, revisions) => getIn(revisions, ["segment", segmentId]) || {},
);

export const getTableQuestions = createSelector(
  [getTable, getQuestions],
  (table, questions): Card[] => {
    const tableId = table.id;
    return Object.values(questions as Record<string, Card>).filter(
      (question) => question.table_id === tableId,
    );
  },
);

export const getLoading = (state: State) =>
  (state as StateWithReference).reference.isLoading;

export const getError = (state: State) =>
  (state as StateWithReference).reference.error;

export const getHasSingleSchema = createSelector(
  [getTablesByDatabase],
  (tables) => {
    const list = Object.values(tables);
    // NOTE: original compared each row's `schema_name` to the first row's
    // `schema` (different fields). Behavior preserved verbatim — likely a
    // pre-existing bug, but out of scope for the TS conversion.
    return list.length > 0
      ? list.every((table) => table.schema_name === list[0].schema)
      : true;
  },
);

export const getIsEditing = (state: State) =>
  (state as StateWithReference).reference.isEditing;

export const getIsFormulaExpanded = (state: StateWithReference) =>
  state.reference.isFormulaExpanded;
