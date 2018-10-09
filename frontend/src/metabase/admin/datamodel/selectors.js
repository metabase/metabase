import { createSelector } from "reselect";
import { computeMetadataStrength } from "metabase/lib/schema_metadata";

const segmentsSelector = (state, props) => state.admin.datamodel.segments;
const metricsSelector = (state, props) => state.admin.datamodel.metrics;

const tableMetadataSelector = (state, props) =>
  state.admin.datamodel.tableMetadata;
const previewSummarySelector = (state, props) =>
  state.admin.datamodel.previewSummary;
const revisionObjectSelector = (state, props) =>
  state.admin.datamodel.revisionObject;

const idSelector = (state, props) =>
  props.params.id == null ? null : parseInt(props.params.id);
const tableIdSelector = (state, props) =>
  props.location.query.table == null
    ? null
    : parseInt(props.location.query.table);

const userSelector = (state, props) => state.currentUser;

export const segmentEditSelectors = createSelector(
  segmentsSelector,
  idSelector,
  tableIdSelector,
  tableMetadataSelector,
  (segments, id, tableId, tableMetadata) => ({
    segment:
      id == null
        ? { id: null, table_id: tableId, definition: { filter: [] } }
        : segments[id],
    tableMetadata,
  }),
);

export const segmentFormSelectors = createSelector(
  segmentEditSelectors,
  previewSummarySelector,
  ({ segment, tableMetadata }, previewSummary) => ({
    initialValues: segment,
    tableMetadata,
    previewSummary,
  }),
);

export const metricEditSelectors = createSelector(
  metricsSelector,
  idSelector,
  tableIdSelector,
  tableMetadataSelector,
  (metrics, id, tableId, tableMetadata) => ({
    metric:
      id == null
        ? { id: null, table_id: tableId, definition: { aggregation: [null] } }
        : metrics[id],
    tableMetadata,
  }),
);

export const metricFormSelectors = createSelector(
  metricEditSelectors,
  previewSummarySelector,
  ({ metric, tableMetadata }, previewSummary) => ({
    initialValues: metric,
    tableMetadata,
    previewSummary,
  }),
);

export const revisionHistorySelectors = createSelector(
  revisionObjectSelector,
  tableMetadataSelector,
  userSelector,
  (revisionObject, tableMetadata, user) => ({
    ...revisionObject,
    tableMetadata,
    user,
  }),
);

export const getDatabases = (state, props) => state.admin.datamodel.databases;
export const getDatabaseIdfields = (state, props) =>
  state.admin.datamodel.idfields;
export const getEditingTable = (state, props) =>
  state.admin.datamodel.editingTable;
export const getEditingDatabase = (state, props) =>
  state.admin.datamodel.editingDatabase;

export const getEditingDatabaseWithTableMetadataStrengths = createSelector(
  state => state.admin.datamodel.editingDatabase,
  database => {
    if (!database || !database.tables) {
      return null;
    }

    database.tables = database.tables.map(table => {
      table.metadataStrength = computeMetadataStrength(table);
      return table;
    });

    return database;
  },
);
