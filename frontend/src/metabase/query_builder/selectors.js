/*eslint no-use-before-define: "error"*/

import { createSelector } from "reselect";
import _ from "underscore";
import { getIn, assocIn, updateIn } from "icepick";

// Needed due to wrong dependency resolution order
// eslint-disable-next-line no-unused-vars
import Visualization from "metabase/visualizations/components/Visualization";

import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { getParametersWithExtras } from "metabase/meta/Card";

import Utils from "metabase/lib/utils";

import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

import Databases from "metabase/entities/databases";

import { getMetadata } from "metabase/selectors/metadata";
import { getAlerts } from "metabase/alert/selectors";

export const getUiControls = state => state.qb.uiControls;

export const getIsShowingTemplateTagsEditor = state =>
  getUiControls(state).isShowingTemplateTagsEditor;
export const getIsShowingSnippetSidebar = state =>
  getUiControls(state).isShowingSnippetSidebar;
export const getIsShowingDataReference = state =>
  getUiControls(state).isShowingDataReference;
export const getIsShowingRawTable = state =>
  getUiControls(state).isShowingRawTable;
export const getIsEditing = state => getUiControls(state).isEditing;
export const getIsRunning = state => getUiControls(state).isRunning;

export const getCard = state => state.qb.card;
export const getOriginalCard = state => state.qb.originalCard;
export const getLastRunCard = state => state.qb.lastRunCard;

export const getParameterValues = state => state.qb.parameterValues;
export const getQueryResults = state => state.qb.queryResults;
export const getFirstQueryResult = state =>
  state.qb.queryResults && state.qb.queryResults[0];

// get instance settings, used for determining whether to display certain actions
export const getSettings = state => state.settings.values;

export const getIsNew = state => state.qb.card && !state.qb.card.id;

export const getQueryStartTime = state => state.qb.queryStartTime;

export const getDatabaseId = createSelector(
  [getCard],
  card => card && card.dataset_query && card.dataset_query.database,
);

export const getTableId = createSelector(
  [getCard],
  card => getIn(card, ["dataset_query", "query", "source-table"]),
);

export const getTableForeignKeyReferences = state =>
  state.qb.tableForeignKeyReferences;

export const getDatabasesList = state =>
  Databases.selectors.getList(state, {
    entityQuery: { include: "tables", saved: true },
  }) || [];

export const getTables = createSelector(
  [getDatabaseId, getDatabasesList],
  (databaseId, databases) => {
    if (databaseId != null && databases && databases.length > 0) {
      const db = _.findWhere(databases, { id: databaseId });
      if (db && db.tables) {
        return db.tables;
      }
    }

    return [];
  },
);

export const getNativeDatabases = createSelector(
  [getDatabasesList],
  databases =>
    databases && databases.filter(db => db.native_permissions === "write"),
);

export const getTableMetadata = createSelector(
  [getTableId, getMetadata],
  (tableId, metadata) => metadata.table(tableId),
);

export const getTableForeignKeys = createSelector(
  [getTableMetadata],
  table => table && table.fks,
);

export const getSampleDatasetId = createSelector(
  [getDatabasesList],
  databases => {
    const sampleDataset = _.findWhere(databases, { is_sample: true });
    return sampleDataset && sampleDataset.id;
  },
);

export const getDatabaseFields = createSelector(
  [getDatabaseId, state => state.qb.databaseFields],
  (databaseId, databaseFields) => [], // FIXME!
);

export const getParameters = createSelector(
  [getCard, getParameterValues],
  (card, parameterValues) => getParametersWithExtras(card, parameterValues),
);

const getLastRunDatasetQuery = createSelector(
  [getLastRunCard],
  card => card && card.dataset_query,
);
const getNextRunDatasetQuery = createSelector(
  [getCard],
  card => card && card.dataset_query,
);

const getLastRunParameters = createSelector(
  [getFirstQueryResult],
  queryResult =>
    (queryResult &&
      queryResult.json_query &&
      queryResult.json_query.parameters) ||
    [],
);
const getLastRunParameterValues = createSelector(
  [getLastRunParameters],
  parameters => parameters.map(parameter => parameter.value),
);
const getNextRunParameterValues = createSelector(
  [getParameters],
  parameters =>
    parameters.map(parameter => parameter.value).filter(p => p !== undefined),
);

// Certain differences in a query should be ignored. `normalizeQuery`
// standardizes the query before comparision in `getIsResultDirty`.
function normalizeQuery(query, tableMetadata) {
  if (!query) {
    return query;
  }
  if (query.query && tableMetadata) {
    query = updateIn(query, ["query", "fields"], fields => {
      fields = fields
        ? // if the query has fields, copy them before sorting
          [...fields]
        : // if the fields aren't set, we get them from the table metadata
          tableMetadata.fields.map(({ id }) => ["field-id", id]);
      return fields.sort((a, b) =>
        JSON.stringify(b).localeCompare(JSON.stringify(a)),
      );
    });
  }
  if (query.native && query.native["template-tags"] == null) {
    query = assocIn(query, ["native", "template-tags"], {});
  }
  return query;
}

export const getIsResultDirty = createSelector(
  [
    getLastRunDatasetQuery,
    getNextRunDatasetQuery,
    getLastRunParameterValues,
    getNextRunParameterValues,
    getTableMetadata,
  ],
  (
    lastDatasetQuery,
    nextDatasetQuery,
    lastParameters,
    nextParameters,
    tableMetadata,
  ) => {
    lastDatasetQuery = normalizeQuery(lastDatasetQuery, tableMetadata);
    nextDatasetQuery = normalizeQuery(nextDatasetQuery, tableMetadata);
    return (
      !Utils.equals(lastDatasetQuery, nextDatasetQuery) ||
      !Utils.equals(lastParameters, nextParameters)
    );
  },
);

export const getQuestion = createSelector(
  [getMetadata, getCard, getParameterValues],
  (metadata, card, parameterValues) =>
    metadata && card && new Question(card, metadata, parameterValues),
);

export const getLastRunQuestion = createSelector(
  [getMetadata, getLastRunCard, getParameterValues],
  (metadata, card, parameterValues) =>
    card && metadata && new Question(card, metadata, parameterValues),
);

export const getOriginalQuestion = createSelector(
  [getMetadata, getOriginalCard],
  (metadata, card) =>
    // NOTE Atte Keinänen 5/31/17 Should the originalQuestion object take parameterValues or not? (currently not)
    metadata && card && new Question(card, metadata),
);

export const getMode = createSelector(
  [getLastRunQuestion],
  question => question && question.mode(),
);

export const getIsObjectDetail = createSelector(
  [getMode],
  mode => mode && mode.name() === "object",
);

export const getIsDirty = createSelector(
  [getQuestion, getOriginalQuestion],
  (question, originalQuestion) =>
    question && question.isDirtyComparedTo(originalQuestion),
);

export const getQuery = createSelector(
  [getQuestion],
  question => question && question.query(),
);

export const getIsRunnable = createSelector(
  [getQuestion],
  question => question && question.canRun(),
);

export const getQuestionAlerts = createSelector(
  [getAlerts, getCard],
  (alerts, card) =>
    (card && card.id && _.pick(alerts, alert => alert.card.id === card.id)) ||
    {},
);

export const getResultsMetadata = createSelector(
  [getFirstQueryResult],
  result => result && result.data && result.data.results_metadata,
);

/**
 * Returns the card and query results data in a format that `Visualization.jsx` expects
 */
export const getRawSeries = createSelector(
  [
    getQuestion,
    getQueryResults,
    getIsObjectDetail,
    getLastRunDatasetQuery,
    getIsShowingRawTable,
  ],
  (
    question,
    results,
    isObjectDetail,
    lastRunDatasetQuery,
    isShowingRawTable,
  ) => {
    let display = question && question.display();
    let settings = question && question.settings();
    if (isObjectDetail) {
      display = "object";
    } else if (isShowingRawTable) {
      display = "table";
      settings = { "table.pivot": false };
    }

    // we want to provide the visualization with a card containing the latest
    // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
    // BUT the last executed "dataset_query" (to ensure data matches the query)
    return (
      results &&
      question.atomicQueries().map((metricQuery, index) => ({
        card: {
          ...question.card(),
          display: display,
          visualization_settings: settings,
          dataset_query: lastRunDatasetQuery,
        },
        data: results[index] && results[index].data,
      }))
    );
  },
);

const _getVisualizationTransformed = createSelector(
  [getRawSeries],
  rawSeries =>
    rawSeries && getVisualizationTransformed(extractRemappings(rawSeries)),
);

/**
 * Returns the final series data that all visualization (starting from the root-level
 * `Visualization.jsx` component) code uses for rendering visualizations.
 */
export const getTransformedSeries = createSelector(
  [_getVisualizationTransformed],
  transformed => transformed && transformed.series,
);

export const getTransformedVisualization = createSelector(
  [_getVisualizationTransformed],
  transformed => transformed && transformed.visualization,
);

/**
 * Returns complete visualization settings (including default values for those settings which aren't explicitly set)
 */
export const getVisualizationSettings = createSelector(
  [getTransformedSeries],
  series => series && getComputedSettingsForSeries(series),
);

export const getQueryBuilderMode = createSelector(
  [getUiControls],
  uiControls => uiControls.queryBuilderMode,
);

/**
 * Returns whether the current question is a native query
 */
export const getIsNative = createSelector(
  [getQuestion],
  question => question && question.query() instanceof NativeQuery,
);

/**
 * Returns whether the native query editor is open
 */
export const getIsNativeEditorOpen = createSelector(
  [getIsNative, getUiControls],
  (isNative, uiControls) => isNative && uiControls.isNativeEditorOpen,
);

const getNativeEditorSelectedRange = createSelector(
  [getUiControls],
  uiControls => uiControls && uiControls.nativeEditorSelectedRange,
);

function getOffsetForQueryAndPosition(queryText, { row, column }) {
  const queryLines = queryText.split("\n");
  return (
    // the total length of the previous rows
    queryLines
      .slice(0, row)
      .reduce((sum, rowContent) => sum + rowContent.length, 0) +
    // the newlines that were removed by split
    row +
    // the preceding characters in the row with the cursor
    column
  );
}

export const getNativeEditorCursorOffset = createSelector(
  [getNativeEditorSelectedRange, getNextRunDatasetQuery],
  (selectedRange, query) => {
    if (selectedRange == null || query == null || query.native == null) {
      return null;
    }
    return getOffsetForQueryAndPosition(query.native.query, selectedRange.end);
  },
);

export const getNativeEditorSelectedText = createSelector(
  [getNativeEditorSelectedRange, getNextRunDatasetQuery],
  (selectedRange, query) => {
    if (selectedRange == null || query == null || query.native == null) {
      return null;
    }
    const queryText = query.native.query;
    const start = getOffsetForQueryAndPosition(queryText, selectedRange.start);
    const end = getOffsetForQueryAndPosition(queryText, selectedRange.end);
    return queryText.slice(start, end);
  },
);

export const getModalSnippet = createSelector(
  [getUiControls],
  uiControls => uiControls && uiControls.modalSnippet,
);

/**
 * Returns whether the query can be "preview", i.e. native query editor is open and visualization is table
 * NOTE: completely disabled for now
 */
export const getIsPreviewable = createSelector(
  [getIsNativeEditorOpen, getQuestion, getIsNew, getIsDirty],
  (isNativeEditorOpen, question, isNew, isDirty) =>
    // isNativeEditorOpen &&
    // question &&
    // question.display() === "table" &&
    // (isNew || isDirty),
    false,
);

/**
 * Returns whether the query builder is in native query "preview" mode
 */
export const getIsPreviewing = createSelector(
  [getIsPreviewable, getUiControls],
  (isPreviewable, uiControls) => isPreviewable && uiControls.isPreviewing,
);

export const getIsVisualized = createSelector(
  [getQuestion, getVisualizationSettings],
  (question, settings) =>
    question &&
    // table is the default
    (question.display() !== "table" ||
      // any "table." settings has been explcitly set
      Object.keys(question.settings()).some(k => k.startsWith("table.")) ||
      // "table.pivot" setting has been implicitly set to true
      (settings && settings["table.pivot"])),
);

export const getIsLiveResizable = createSelector(
  [getTransformedSeries, getTransformedVisualization],
  (series, visualization) => {
    try {
      return (
        !series ||
        !visualization ||
        !visualization.isLiveResizable ||
        visualization.isLiveResizable(series)
      );
    } catch (e) {
      console.error(e);
      return false;
    }
  },
);
