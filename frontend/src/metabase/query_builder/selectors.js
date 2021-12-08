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
import { getValueAndFieldIdPopulatedParametersFromCard } from "metabase/parameters/utils/cards";
import { normalizeParameterValue } from "metabase/parameters/utils/parameter-values";

import Utils from "metabase/lib/utils";

import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { isVirtualCardId } from "metabase/lib/saved-questions";

import Databases from "metabase/entities/databases";

import { getMetadata } from "metabase/selectors/metadata";
import { getAlerts } from "metabase/alert/selectors";

import { isAdHocDatasetQuestion } from "./utils";

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

export const getTableId = createSelector([getCard], card =>
  getIn(card, ["dataset_query", "query", "source-table"]),
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
  [getCard, getMetadata, getParameterValues],
  (card, metadata, parameterValues) =>
    getValueAndFieldIdPopulatedParametersFromCard(
      card,
      metadata,
      parameterValues,
    ),
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
const getNextRunParameterValues = createSelector([getParameters], parameters =>
  parameters
    .filter(
      // parameters with an empty value get filtered out before a query run,
      // so in order to compare current parameters to previously-used parameters we need
      // to filter them here as well
      parameter => parameter.value != null,
    )
    .map(parameter =>
      // parameters are "normalized" immediately before a query run, so in order
      // to compare current parameters to previously-used parameters we need
      // to run parameters through this normalization function
      normalizeParameterValue(parameter.type, parameter.value),
    )
    .filter(p => p !== undefined),
);

export const getQueryBuilderMode = createSelector(
  [getUiControls],
  uiControls => uiControls.queryBuilderMode,
);

export const getDatasetEditorTab = createSelector(
  [getUiControls],
  uiControls => uiControls.datasetEditorTab,
);

export const getOriginalQuestion = createSelector(
  [getMetadata, getOriginalCard],
  (metadata, card) => metadata && card && new Question(card, metadata),
);

export const getQuestion = createSelector(
  [getMetadata, getCard, getParameterValues, getQueryBuilderMode],
  (metadata, card, parameterValues, queryBuilderMode) => {
    if (!metadata || !card) {
      return;
    }
    const question = new Question(card, metadata, parameterValues);

    if (queryBuilderMode === "dataset") {
      return question.lockDisplay();
    }

    // When opening a dataset, we swap it's `dataset_query`
    // with clean query using the dataset as a source table,
    // to enable "simple mode" like features
    return question.isDataset() ? question.composeDataset() : question;
  },
);

function normalizeClause(clause) {
  return typeof clause?.raw === "function" ? clause.raw() : clause;
}

// Certain differences in a query should be ignored. `normalizeQuery`
// standardizes the query before comparison in `getIsResultDirty`.
export function normalizeQuery(query, tableMetadata) {
  if (!query) {
    return query;
  }
  if (query.query) {
    if (tableMetadata) {
      query = updateIn(query, ["query", "fields"], fields => {
        fields = fields
          ? // if the query has fields, copy them before sorting
            [...fields]
          : // if the fields aren't set, we get them from the table metadata
            tableMetadata.fields.map(({ id }) => ["field", id, null]);
        return fields.sort((a, b) =>
          JSON.stringify(b).localeCompare(JSON.stringify(a)),
        );
      });
    }
    ["aggregation", "breakout", "filter", "joins", "order-by"].forEach(
      clauseList => {
        if (query.query[clauseList]) {
          query = updateIn(query, ["query", clauseList], clauses =>
            clauses.map(normalizeClause),
          );
        }
      },
    );
  }
  if (query.native && query.native["template-tags"] == null) {
    query = assocIn(query, ["native", "template-tags"], {});
  }
  return query;
}

export const getIsResultDirty = createSelector(
  [
    getQuestion,
    getOriginalQuestion,
    getLastRunDatasetQuery,
    getNextRunDatasetQuery,
    getLastRunParameterValues,
    getNextRunParameterValues,
    getTableMetadata,
  ],
  (
    question,
    originalQuestion,
    lastDatasetQuery,
    nextDatasetQuery,
    lastParameters,
    nextParameters,
    tableMetadata,
  ) => {
    // When viewing a dataset, its dataset_query is swapped with a clean query using the dataset as a source table
    // (it's necessary for datasets to behave like tables opened in simple mode)
    // We need to escape the isDirty check as it will always be true in this case,
    // and the page will always be covered with a 'rerun' overlay.
    // Once the dataset_query changes, the question will loose the "dataset" flag and it'll work normally
    if (question && isAdHocDatasetQuestion(question, originalQuestion)) {
      return false;
    }

    lastDatasetQuery = normalizeQuery(lastDatasetQuery, tableMetadata);
    nextDatasetQuery = normalizeQuery(nextDatasetQuery, tableMetadata);
    return (
      !Utils.equals(lastDatasetQuery, nextDatasetQuery) ||
      !Utils.equals(lastParameters, nextParameters)
    );
  },
);

export const getLastRunQuestion = createSelector(
  [getMetadata, getLastRunCard, getParameterValues],
  (metadata, card, parameterValues) =>
    card && metadata && new Question(card, metadata, parameterValues),
);

export const getMode = createSelector(
  [getLastRunQuestion],
  question => question && question.mode(),
);

export const getIsObjectDetail = createSelector(
  [getMode, getQueryResults],
  (mode, results) => {
    // It handles filtering by a manually set PK column that is not unique
    const hasMultipleRows = results?.some(({ data }) => data?.rows.length > 1);
    return mode?.name() === "object" && !hasMultipleRows;
  },
);

export const getIsDirty = createSelector(
  [getQuestion, getOriginalQuestion],
  (question, originalQuestion) => {
    // When viewing a dataset, its dataset_query is swapped with a clean query using the dataset as a source table
    // (it's necessary for datasets to behave like tables opened in simple mode)
    // We need to escape the isDirty check as it will always be true in this case,
    // and the page will always be covered with a 'rerun' overlay.
    // Once the dataset_query changes, the question will loose the "dataset" flag and it'll work normally
    if (!question || isAdHocDatasetQuestion(question, originalQuestion)) {
      return false;
    }
    return question.isDirtyComparedToWithoutParameters(originalQuestion);
  },
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

export const getSnippetCollectionId = createSelector(
  [getUiControls],
  uiControls => uiControls && uiControls.snippetCollectionId,
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
    ((question.display() !== "table" && question.display() !== "pivot") ||
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

export const getQuestionDetailsTimelineDrawerState = createSelector(
  [getUiControls],
  uiControls => uiControls && uiControls.questionDetailsTimelineDrawerState,
);

export const getSourceTable = createSelector([getQuestion], question => {
  const query = question.isStructured()
    ? question.query().rootQuery()
    : question.query();
  return query.table();
});

export const isBasedOnExistingQuestion = createSelector(
  [getSourceTable, getOriginalQuestion],
  (sourceTable, originalQuestion) => {
    if (sourceTable != null) {
      return isVirtualCardId(sourceTable.id);
    } else {
      return originalQuestion != null;
    }
  },
);
