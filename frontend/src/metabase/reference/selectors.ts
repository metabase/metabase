import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";

import type { State } from "metabase/redux/store";
import {
  getShallowDatabases as getDatabases,
  getShallowFields as getFields,
  getShallowSegments as getSegments,
  getShallowTables as getTables,
} from "metabase/selectors/metadata";

import { idsToObjectMap } from "./utils";

interface ReferenceRouteParams {
  segmentId?: string;
  databaseId?: string;
  tableId?: string;
  fieldId?: string;
}

interface ReferenceRouteProps {
  params: ReferenceRouteParams;
}

interface ReferenceSliceState {
  isLoading: boolean;
  error: unknown;
  isEditing: boolean;
  isFormulaExpanded: boolean;
}

type StateWithReference = State & {
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
  (segmentId, segments) => segments[segmentId] || { id: segmentId },
);

export const getDatabaseId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.databaseId ?? "");

export const getDatabase = createSelector(
  [getDatabaseId, getDatabases],
  (databaseId, databases) => databases[databaseId] || { id: databaseId },
);

export const getTableId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.tableId ?? "");
// export const getTableId = (state, props) => Number.parseInt(props.params.tableId);
export const getTablesByDatabase = createSelector(
  [getTables, getDatabase],
  (tables, database) => {
    const databaseTables = (database as { tables?: Array<string | number> })
      .tables;
    return tables && databaseTables
      ? idsToObjectMap(databaseTables, tables)
      : {};
  },
);
export const getTableBySegment = createSelector(
  [getSegment, getTables],
  (segment, tables) =>
    segment && segment.table_id ? tables[segment.table_id] : {},
);
export const getTable = createSelector(
  [getTableId, getTables, getSegmentId, getTableBySegment],
  (tableId, tables, segmentId, tableBySegment) =>
    tableId
      ? tables[tableId] || { id: tableId }
      : segmentId
        ? tableBySegment
        : {},
);

export const getFieldId = (
  _state: StateWithReference,
  props: ReferenceRouteProps,
) => Number.parseInt(props.params.fieldId ?? "");
export const getFieldsByTable = createSelector(
  [getTable, getFields],
  (table, fields) => {
    const tableFields = (table as { fields?: Array<string | number> }).fields;
    return tableFields
      ? idsToObjectMap(
          tableFields,
          fields as unknown as Record<string | number, { id: string | number }>,
        )
      : {};
  },
);
export const getFieldsBySegment = createSelector(
  [getTableBySegment, getFields],
  (table, fields) => {
    const tableFields = (table as { fields?: Array<string | number> }).fields;
    return tableFields
      ? idsToObjectMap(
          tableFields,
          fields as unknown as Record<string | number, { id: string | number }>,
        )
      : {};
  },
);
export const getField = createSelector(
  [getFieldId, getFields],
  (fieldId, fields) => fields[fieldId] || { id: fieldId },
);
export const getFieldBySegment = createSelector(
  [getFieldId, getFieldsBySegment],
  (fieldId, fields) => fields[fieldId] || { id: fieldId },
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
  (table, questions) => {
    const tableId = (table as { id?: number | string }).id;
    return Object.values(questions as Record<string, unknown>).filter(
      (question) =>
        (question as { table_id?: number | string }).table_id === tableId,
    );
  },
);

export const getLoading = (state: State) =>
  (state as StateWithReference).reference.isLoading;

export const getError = (state: State) =>
  (state as StateWithReference).reference.error;

export const getHasSingleSchema = createSelector(
  [getTablesByDatabase],
  (tables) =>
    tables && Object.keys(tables).length > 0
      ? Object.values(tables).every(
          (table: { schema_name?: string }, _index, tables) =>
            table.schema_name === (tables[0] as { schema?: string }).schema,
        )
      : true,
);

export const getIsEditing = (state: State) =>
  (state as StateWithReference).reference.isEditing;

export const getIsFormulaExpanded = (state: StateWithReference) =>
  state.reference.isFormulaExpanded;
