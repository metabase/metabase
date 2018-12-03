import { createSelector } from "reselect";
import _ from "underscore";

// Needed due to wrong dependency resolution order
// eslint-disable-next-line no-unused-vars
import Visualization from "metabase/visualizations/components/Visualization";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import { getParametersWithExtras } from "metabase/meta/Card";

import { isCardDirty } from "metabase/lib/card";
import Utils from "metabase/lib/utils";

import Question from "metabase-lib/lib/Question";

import { getIn } from "icepick";

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata";

export const getUiControls = state => state.qb.uiControls;

export const getIsShowingTemplateTagsEditor = state =>
  getUiControls(state).isShowingTemplateTagsEditor;
export const getIsShowingDataReference = state =>
  getUiControls(state).isShowingDataReference;
export const getIsShowingTutorial = state =>
  getUiControls(state).isShowingTutorial;
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

export const getIsDirty = createSelector(
  [getCard, getOriginalCard],
  (card, originalCard) => {
    return isCardDirty(card, originalCard);
  },
);

export const getIsNew = state => state.qb.card && !state.qb.card.id;

export const getDatabaseId = createSelector(
  [getCard],
  card => card && card.dataset_query && card.dataset_query.database,
);

export const getTableId = createSelector([getCard], card =>
  getIn(card, ["dataset_query", "query", "source-table"]),
);

export const getTableForeignKeys = state => state.qb.tableForeignKeys;
export const getTableForeignKeyReferences = state =>
  state.qb.tableForeignKeyReferences;

export const getTables = createSelector(
  [getDatabaseId, getDatabasesList],
  (databaseId, databases) => {
    if (databaseId != null && databases && databases.length > 0) {
      let db = _.findWhere(databases, { id: databaseId });
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
  (tableId, metadata) => metadata.tables[tableId],
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
  (databaseId, databaseFields) => databaseFields[databaseId],
);

import { getMode as getMode_ } from "metabase/qb/lib/modes";
import { getAlerts } from "metabase/alert/selectors";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";

export const getMode = createSelector(
  [getLastRunCard, getTableMetadata],
  (card, tableMetadata) => getMode_(card, tableMetadata),
);

export const getIsObjectDetail = createSelector(
  [getMode],
  mode => mode && mode.name === "object",
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
const getNextRunParameterValues = createSelector([getParameters], parameters =>
  parameters.map(parameter => parameter.value).filter(p => p !== undefined),
);

export const getIsResultDirty = createSelector(
  [
    getLastRunDatasetQuery,
    getNextRunDatasetQuery,
    getLastRunParameterValues,
    getNextRunParameterValues,
  ],
  (lastDatasetQuery, nextDatasetQuery, lastParameters, nextParameters) => {
    return (
      !Utils.equals(lastDatasetQuery, nextDatasetQuery) ||
      !Utils.equals(lastParameters, nextParameters)
    );
  },
);

export const getQuestion = createSelector(
  [getMetadata, getCard, getParameterValues],
  (metadata, card, parameterValues) => {
    return metadata && card && new Question(metadata, card, parameterValues);
  },
);

export const getLastRunQuestion = createSelector(
  [getMetadata, getLastRunCard, getParameterValues],
  (metadata, getLastRunCard, parameterValues) => {
    return (
      metadata &&
      getLastRunCard &&
      new Question(metadata, getLastRunCard, parameterValues)
    );
  },
);

export const getOriginalQuestion = createSelector(
  [getMetadata, getOriginalCard],
  (metadata, card) => {
    // NOTE Atte Keinänen 5/31/17 Should the originalQuestion object take parameterValues or not? (currently not)
    return metadata && card && new Question(metadata, card);
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
  [getQuestion, getQueryResults, getIsObjectDetail, getLastRunDatasetQuery],
  (question, results, isObjectDetail, lastRunDatasetQuery) => {
    // we want to provide the visualization with a card containing the latest
    // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
    // BUT the last executed "dataset_query" (to ensure data matches the query)
    return (
      results &&
      question.atomicQueries().map((metricQuery, index) => ({
        card: {
          ...question.card(),
          display: isObjectDetail ? "object" : question.card().display,
          dataset_query: lastRunDatasetQuery,
        },
        data: results[index] && results[index].data,
      }))
    );
  },
);

/**
 * Returns the final series data that all visualization (starting from the root-level
 * `Visualization.jsx` component) code uses for rendering visualizations.
 */
export const getTransformedSeries = createSelector(
  [getRawSeries],
  rawSeries =>
    rawSeries &&
    getVisualizationTransformed(extractRemappings(rawSeries)).series,
);

/**
 * Returns complete visualization settings (including default values for those settings which aren't explicitly set)
 */
export const getVisualizationSettings = createSelector(
  [getTransformedSeries],
  series => series && getComputedSettingsForSeries(series),
);
