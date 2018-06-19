import { createSelector } from "reselect";
import { assoc, getIn } from "icepick";

import Dashboards from "metabase/entities/dashboards";

import Query, { AggregationClause } from "metabase/lib/query";
import { resourceListToMap } from "metabase/lib/redux";

import { idsToObjectMap, databaseToForeignKeys } from "./utils";

// import { getDatabases, getTables, getFields, getMetrics, getSegments } from "metabase/selectors/metadata";

import {
  getShallowDatabases as getDatabases,
  getShallowTables as getTables,
  getShallowFields as getFields,
  getShallowMetrics as getMetrics,
  getShallowSegments as getSegments,
} from "metabase/selectors/metadata";
export {
  getShallowDatabases as getDatabases,
  getShallowTables as getTables,
  getShallowFields as getFields,
  getShallowMetrics as getMetrics,
  getShallowSegments as getSegments,
} from "metabase/selectors/metadata";

import _ from "underscore";

export const getUser = (state, props) => state.currentUser;

export const getMetricId = (state, props) =>
  Number.parseInt(props.params.metricId);
export const getMetric = createSelector(
  [getMetricId, getMetrics],
  (metricId, metrics) => metrics[metricId] || { id: metricId },
);

export const getSegmentId = (state, props) =>
  Number.parseInt(props.params.segmentId);
export const getSegment = createSelector(
  [getSegmentId, getSegments],
  (segmentId, segments) => segments[segmentId] || { id: segmentId },
);

export const getDatabaseId = (state, props) =>
  Number.parseInt(props.params.databaseId);

export const getDatabase = createSelector(
  [getDatabaseId, getDatabases],
  (databaseId, databases) => databases[databaseId] || { id: databaseId },
);

export const getTableId = (state, props) =>
  Number.parseInt(props.params.tableId);
// export const getTableId = (state, props) => Number.parseInt(props.params.tableId);
export const getTablesByDatabase = createSelector(
  [getTables, getDatabase],
  (tables, database) =>
    tables && database && database.tables
      ? idsToObjectMap(database.tables, tables)
      : {},
);
export const getTableBySegment = createSelector(
  [getSegment, getTables],
  (segment, tables) =>
    segment && segment.table_id ? tables[segment.table_id] : {},
);
const getTableByMetric = createSelector(
  [getMetric, getTables],
  (metric, tables) =>
    metric && metric.table_id ? tables[metric.table_id] : {},
);
export const getTable = createSelector(
  [
    getTableId,
    getTables,
    getMetricId,
    getTableByMetric,
    getSegmentId,
    getTableBySegment,
  ],
  (tableId, tables, metricId, tableByMetric, segmentId, tableBySegment) =>
    tableId
      ? tables[tableId] || { id: tableId }
      : metricId ? tableByMetric : segmentId ? tableBySegment : {},
);

export const getFieldId = (state, props) =>
  Number.parseInt(props.params.fieldId);
export const getFieldsByTable = createSelector(
  [getTable, getFields],
  (table, fields) =>
    table && table.fields ? idsToObjectMap(table.fields, fields) : {},
);
export const getFieldsBySegment = createSelector(
  [getTableBySegment, getFields],
  (table, fields) =>
    table && table.fields ? idsToObjectMap(table.fields, fields) : {},
);
export const getField = createSelector(
  [getFieldId, getFields],
  (fieldId, fields) => fields[fieldId] || { id: fieldId },
);
export const getFieldBySegment = createSelector(
  [getFieldId, getFieldsBySegment],
  (fieldId, fields) => fields[fieldId] || { id: fieldId },
);

const getQuestions = (state, props) =>
  getIn(state, ["entities", "questions"]) || {};

export const getMetricQuestions = createSelector(
  [getMetricId, getQuestions],
  (metricId, questions) =>
    Object.values(questions)
      .filter(
        question =>
          question.dataset_query.type === "query" &&
          _.any(
            Query.getAggregations(question.dataset_query.query),
            aggregation =>
              AggregationClause.getMetric(aggregation) === metricId,
          ),
      )
      .reduce((map, question) => assoc(map, question.id, question), {}),
);

const getRevisions = (state, props) => state.revisions;

export const getMetricRevisions = createSelector(
  [getMetricId, getRevisions],
  (metricId, revisions) => getIn(revisions, ["metric", metricId]) || {},
);

export const getSegmentRevisions = createSelector(
  [getSegmentId, getRevisions],
  (segmentId, revisions) => getIn(revisions, ["segment", segmentId]) || {},
);

export const getSegmentQuestions = createSelector(
  [getSegmentId, getQuestions],
  (segmentId, questions) =>
    Object.values(questions)
      .filter(
        question =>
          question.dataset_query.type === "query" &&
          Query.getFilters(question.dataset_query.query).some(
            filter => Query.isSegmentFilter(filter) && filter[1] === segmentId,
          ),
      )
      .reduce((map, question) => assoc(map, question.id, question), {}),
);

export const getTableQuestions = createSelector(
  [getTable, getQuestions],
  (table, questions) =>
    Object.values(questions).filter(question => question.table_id === table.id),
);

const getDatabaseBySegment = createSelector(
  [getSegment, getTables, getDatabases],
  (segment, tables, databases) =>
    (segment &&
      segment.table_id &&
      tables[segment.table_id] &&
      databases[tables[segment.table_id].db_id]) ||
    {},
);

const getForeignKeysBySegment = createSelector(
  [getDatabaseBySegment],
  databaseToForeignKeys,
);

const getForeignKeysByDatabase = createSelector(
  [getDatabase],
  databaseToForeignKeys,
);

export const getForeignKeys = createSelector(
  [getSegmentId, getForeignKeysBySegment, getForeignKeysByDatabase],
  (segmentId, foreignKeysBySegment, foreignKeysByDatabase) =>
    segmentId ? foreignKeysBySegment : foreignKeysByDatabase,
);

export const getLoading = (state, props) => state.reference.isLoading;

export const getError = (state, props) => state.reference.error;

export const getHasSingleSchema = createSelector(
  [getTablesByDatabase],
  tables =>
    tables && Object.keys(tables).length > 0
      ? Object.values(tables).every(
          (table, index, tables) => table.schema === tables[0].schema,
        )
      : true,
);

export const getIsEditing = (state, props) => state.reference.isEditing;

export const getIsFormulaExpanded = (state, props) =>
  state.reference.isFormulaExpanded;

export const getGuide = (state, props) => state.reference.guide;

export const getDashboards = (state, props) => {
  const list = Dashboards.selectors.getList(state);
  return list && resourceListToMap(list);
};

export const getIsDashboardModalOpen = (state, props) =>
  state.reference.isDashboardModalOpen;
