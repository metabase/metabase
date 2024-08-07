/* eslint-disable import/order */
/*eslint no-use-before-define: "error"*/

import { createSelector } from "@reduxjs/toolkit";
import * as d3 from "d3";
import { getIn, merge, updateIn } from "icepick";
import _ from "underscore";

import * as Lib from "metabase-lib";

// Needed due to wrong dependency resolution order
import { MetabaseApi } from "metabase/services";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import Databases from "metabase/entities/databases";
import { cleanIndexFlags } from "metabase/entities/model-indexes/actions";
import Timelines from "metabase/entities/timelines";

import { getAlerts } from "metabase/alert/selectors";
import { getDashboardById } from "metabase/dashboard/selectors";
import { parseTimestamp } from "metabase/lib/time";
import { getSortedTimelines } from "metabase/lib/timelines";
import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { getMode as getQuestionMode } from "metabase/visualizations/click-actions/lib/modes";
import {
  computeTimeseriesDataInverval,
  minTimeseriesUnit,
} from "metabase/visualizations/echarts/cartesian/utils/timeseries";
import {
  getXValues,
  isTimeseries,
} from "metabase/visualizations/lib/renderer_utils";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";
import { isAdHocModelQuestion } from "metabase-lib/v1/metadata/utils/models";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import {
  normalizeParameters,
  normalizeParameterValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import Question from "metabase-lib/v1/Question";
import { getIsPKFromTablePredicate } from "metabase-lib/v1/types/utils/isa";
import { LOAD_COMPLETE_FAVICON } from "metabase/hoc/Favicon";
import { isNotNull } from "metabase/lib/types";
import { getQuestionWithDefaultVisualizationSettings } from "./actions/core/utils";
import { createRawSeries, getWritableColumnProperties } from "./utils";

export const getUiControls = state => state.qb.uiControls;
export const getQueryStatus = state => state.qb.queryStatus;
export const getLoadingControls = state => state.qb.loadingControls;

export const getIsShowingTemplateTagsEditor = state =>
  getUiControls(state).isShowingTemplateTagsEditor;
export const getIsShowingSnippetSidebar = state =>
  getUiControls(state).isShowingSnippetSidebar;
export const getIsShowingDataReference = state =>
  getUiControls(state).isShowingDataReference;

// This selector can be called from public questions / dashboards, which do not
// have state.qb
export const getIsShowingRawTable = state =>
  !!state.qb?.uiControls.isShowingRawTable;

const SIDEBARS = [
  "isShowingQuestionDetailsSidebar",
  "isShowingChartTypeSidebar",
  "isShowingChartSettingsSidebar",
  "isShowingTimelineSidebar",

  "isShowingSummarySidebar",

  "isShowingDataReference",
  "isShowingTemplateTagsEditor",
  "isShowingSnippetSidebar",
];

export const getIsAnySidebarOpen = createSelector([getUiControls], uiControls =>
  SIDEBARS.some(sidebar => uiControls[sidebar]),
);

export const getIsRunning = state => getUiControls(state).isRunning;
export const getIsLoadingComplete = state =>
  getQueryStatus(state) === "complete";

export const getCard = state => state.qb.card;
export const getOriginalCard = state => state.qb.originalCard;
export const getLastRunCard = state => state.qb.lastRunCard;

export const getParameterValues = state => state.qb.parameterValues;
export const getParameterValuesSearchCache = state =>
  state.qb.parameterValuesSearchCache;

export const getMetadataDiff = state => state.qb.metadataDiff;

export const getEntities = state => state.entities;
export const getVisibleTimelineEventIds = state =>
  state.qb.visibleTimelineEventIds;
export const getSelectedTimelineEventIds = state =>
  state.qb.selectedTimelineEventIds;

const getRawQueryResults = state => state.qb.queryResults;

export const getIsBookmarked = (state, props) =>
  props.bookmarks.some(
    bookmark =>
      bookmark.type === "card" && bookmark.item_id === state.qb.card?.id,
  );

export const getQueryBuilderMode = createSelector(
  [getUiControls],
  uiControls => uiControls.queryBuilderMode,
);

const getCardResultMetadata = createSelector(
  [getCard],
  card => card?.result_metadata,
);

const getModelMetadataDiff = createSelector(
  [getCardResultMetadata, getMetadataDiff, getQueryBuilderMode],
  (resultMetadata, metadataDiff, queryBuilderMode) => {
    if (!resultMetadata || queryBuilderMode !== "dataset") {
      return metadataDiff;
    }

    return {
      ...metadataDiff,
      ...Object.fromEntries(
        resultMetadata.map(column => [
          column.name,
          {
            ...getWritableColumnProperties(column),
            ...metadataDiff[column.name],
          },
        ]),
      ),
    };
  },
);

export const getQueryResults = createSelector(
  [getRawQueryResults, getModelMetadataDiff],
  (queryResults, metadataDiff) => {
    if (!Array.isArray(queryResults) || !queryResults.length) {
      return null;
    }

    const [result] = queryResults;
    if (result.error || !result?.data?.results_metadata) {
      return queryResults;
    }
    const { cols, results_metadata } = result.data;

    function applyMetadataDiff(column) {
      const columnDiff = metadataDiff[column.name];
      return columnDiff ? merge(column, columnDiff) : column;
    }

    return [
      {
        ...result,
        data: {
          ...result.data,
          cols: cols.map(applyMetadataDiff),
          results_metadata: {
            ...results_metadata,
            columns: results_metadata.columns.map(applyMetadataDiff),
          },
        },
      },
    ];
  },
);

export const getFirstQueryResult = createSelector([getQueryResults], results =>
  Array.isArray(results) ? results[0] : null,
);

export const getTableId = createSelector([getCard], card =>
  getIn(card, ["dataset_query", "query", "source-table"]),
);

export const getPKColumnIndex = createSelector(
  [getFirstQueryResult, getTableId],
  (result, tableId) => {
    if (!result) {
      return;
    }
    const { cols } = result.data;

    const hasMultiplePks =
      cols.filter(getIsPKFromTablePredicate(tableId)).length > 1;

    if (hasMultiplePks) {
      return -1;
    }
    return cols.findIndex(getIsPKFromTablePredicate(tableId));
  },
);

export const getPKRowIndexMap = createSelector(
  [getFirstQueryResult, getPKColumnIndex],
  (result, PKColumnIndex) => {
    if (!result || !Number.isSafeInteger(PKColumnIndex)) {
      return {};
    }
    const { rows } = result.data;
    if (PKColumnIndex < 0) {
      return rows.map((_, index) => index);
    }
    const map = {};
    rows.forEach((row, index) => {
      const PKValue = row[PKColumnIndex];
      map[PKValue] = index;
    });
    return map;
  },
);

// it's very similar to `getPKRowIndexMap` but it is required for covering "view details" click
// we don't have objectId there, only rowId, mapping from `getPKRowIndexMap` is opposite
// if rows are showing the same PK, only last one will have the entry in the map
// and we'll not know which object to show
export const getRowIndexToPKMap = createSelector(
  [getFirstQueryResult, getPKColumnIndex],
  (result, PKColumnIndex) => {
    if (!result || !Number.isSafeInteger(PKColumnIndex)) {
      return {};
    }
    const { rows } = result.data;
    if (PKColumnIndex < 0) {
      return rows.map((_, index) => index);
    }
    const map = {};
    rows.forEach((row, index) => {
      const PKValue = row[PKColumnIndex];
      map[index] = PKValue;
    });
    return map;
  },
);

export const getQueryStartTime = state => state.qb.queryStartTime;

export const getDatabaseId = createSelector(
  [getCard],
  card => card && card.dataset_query && card.dataset_query.database,
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

export const getTableMetadata = createSelector(
  [getTableId, getMetadata],
  (tableId, metadata) => metadata.table(tableId),
);

export const getTableForeignKeys = createSelector([getTableMetadata], table => {
  const tableForeignKeys = table?.fks ?? [];
  const tableForeignKeysWithoutHiddenTables = tableForeignKeys.filter(
    tableForeignKey => tableForeignKey.origin != null,
  );

  return tableForeignKeysWithoutHiddenTables;
});

export const getSampleDatabaseId = createSelector(
  [getDatabasesList],
  databases => {
    const sampleDatabase = _.findWhere(databases, { is_sample: true });
    return sampleDatabase && sampleDatabase.id;
  },
);

export const getDatabaseFields = createSelector(
  [getDatabaseId, state => state.qb.databaseFields],
  (databaseId, databaseFields) => [], // FIXME!
);

export const getParameters = createSelector(
  [getCard, getMetadata, getParameterValues],
  (card, metadata, parameterValues) =>
    getCardUiParameters(card, metadata, parameterValues),
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
  parameters.map(parameter =>
    // parameters are "normalized" immediately before a query run, so in order
    // to compare current parameters to previously-used parameters we need
    // to run parameters through this normalization function
    normalizeParameterValue(parameter.type, parameter.value),
  ),
);

export const getNextRunParameters = createSelector(
  [getParameters],
  parameters => normalizeParameters(parameters),
);

export const getPreviousQueryBuilderMode = createSelector(
  [getUiControls],
  uiControls => uiControls.previousQueryBuilderMode,
);

export const getDatasetEditorTab = createSelector(
  [getUiControls],
  uiControls => uiControls.datasetEditorTab,
);

export const getOriginalQuestion = createSelector(
  [getMetadata, getOriginalCard],
  (metadata, card) => metadata && card && new Question(card, metadata),
);

export const getOriginalQuestionWithParameterValues = createSelector(
  [getMetadata, getOriginalCard, getParameterValues],
  (metadata, card, parameterValues) =>
    metadata && card && new Question(card, metadata, parameterValues),
);

export const getLastRunQuestion = createSelector(
  [getMetadata, getLastRunCard, getParameterValues],
  (metadata, card, parameterValues) =>
    card && metadata && new Question(card, metadata, parameterValues),
);

export const getQuestionWithParameters = createSelector(
  [getCard, getMetadata, getParameterValues],
  (card, metadata, parameterValues) => {
    if (!card || !metadata) {
      return;
    }
    return new Question(card, metadata, parameterValues);
  },
);

export const getQuestion = createSelector(
  [getQuestionWithParameters, getQueryBuilderMode],
  (question, queryBuilderMode) => {
    if (!question) {
      return;
    }

    const isModel = question.type() === "model";
    const isMetric = question.type() === "metric";
    if ((isModel || isMetric) && queryBuilderMode === "dataset") {
      return isModel ? question.lockDisplay() : question;
    }

    // When opening a model or a metric, we construct a question
    // with a clean, ad-hoc, query.
    // This has to be skipped for users without data permissions.
    // See https://github.com/metabase/metabase/issues/20042
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    return (isModel || isMetric) && isEditable
      ? question.composeQuestion()
      : question;
  },
);

function areLegacyQueriesEqual(queryA, queryB, tableMetadata) {
  return Lib.areLegacyQueriesEqual(
    queryA,
    queryB,
    tableMetadata?.fields.map(({ id }) => id),
  );
}

// Models or metrics may be composed via the `composeQuestion` method.
// A composed entity should be treated as the equivalent to its original form.
// We need to handle scenarios where both the `lastRunQuestion` and the `currentQuestion` are
// in either form.
function areComposedEntitiesEquivalent({
  originalQuestion,
  lastRunQuestion,
  currentQuestion,
  tableMetadata,
}) {
  const isQuestion = originalQuestion?.type() === "question";
  if (!originalQuestion || !lastRunQuestion || !currentQuestion || isQuestion) {
    return false;
  }

  const composedOriginal = originalQuestion.composeQuestionAdhoc();

  const isLastRunComposed = areLegacyQueriesEqual(
    lastRunQuestion.datasetQuery(),
    composedOriginal.datasetQuery(),
    tableMetadata,
  );
  const isCurrentComposed = areLegacyQueriesEqual(
    currentQuestion.datasetQuery(),
    composedOriginal.datasetQuery(),
    tableMetadata,
  );

  const isLastRunEquivalentToCurrent =
    isLastRunComposed &&
    areLegacyQueriesEqual(
      currentQuestion.datasetQuery(),
      originalQuestion.datasetQuery(),
      tableMetadata,
    );

  const isCurrentEquivalentToLastRun =
    isCurrentComposed &&
    areLegacyQueriesEqual(
      lastRunQuestion.datasetQuery(),
      originalQuestion.datasetQuery(),
      tableMetadata,
    );

  return isLastRunEquivalentToCurrent || isCurrentEquivalentToLastRun;
}

function areQueriesEquivalent({
  originalQuestion,
  lastRunQuestion,
  currentQuestion,
  tableMetadata,
}) {
  return (
    areLegacyQueriesEqual(
      lastRunQuestion?.datasetQuery(),
      currentQuestion?.datasetQuery(),
      tableMetadata,
    ) ||
    areComposedEntitiesEquivalent({
      originalQuestion,
      lastRunQuestion,
      currentQuestion,
      tableMetadata,
    })
  );
}

export const getIsResultDirty = createSelector(
  [
    getQuestion,
    getOriginalQuestion,
    getLastRunQuestion,
    getLastRunParameterValues,
    getNextRunParameterValues,
    getTableMetadata,
  ],
  (
    question,
    originalQuestion,
    lastRunQuestion,
    lastParameters,
    nextParameters,
    tableMetadata,
  ) => {
    const haveParametersChanged = !_.isEqual(lastParameters, nextParameters);
    const isEditable =
      question && Lib.queryDisplayInfo(question.query()).isEditable;

    return (
      haveParametersChanged ||
      (isEditable &&
        !areQueriesEquivalent({
          originalQuestion,
          lastRunQuestion,
          currentQuestion: question,
          tableMetadata,
        }))
    );
  },
);

export const getZoomedObjectId = state => state.qb.zoomedRowObjectId;

const getZoomedObjectRowIndex = createSelector(
  [getPKRowIndexMap, getZoomedObjectId],
  (PKRowIndexMap, objectId) => {
    if (!PKRowIndexMap) {
      return;
    }
    return PKRowIndexMap[objectId] ?? PKRowIndexMap[parseInt(objectId)];
  },
);

export const getPreviousRowPKValue = createSelector(
  [getFirstQueryResult, getPKColumnIndex, getZoomedObjectRowIndex],
  (result, PKColumnIndex, rowIndex) => {
    if (!result) {
      return;
    }
    if (PKColumnIndex === -1) {
      return rowIndex - 1;
    }
    const { rows } = result.data;
    return rows[rowIndex - 1][PKColumnIndex];
  },
);

export const getNextRowPKValue = createSelector(
  [getFirstQueryResult, getPKColumnIndex, getZoomedObjectRowIndex],
  (result, PKColumnIndex, rowIndex) => {
    if (!result) {
      return;
    }
    if (PKColumnIndex === -1) {
      return rowIndex + 1;
    }
    const { rows } = result.data;
    return rows[rowIndex + 1][PKColumnIndex];
  },
);

export const getCanZoomPreviousRow = createSelector(
  [getZoomedObjectRowIndex],
  rowIndex => rowIndex !== 0,
);

export const getCanZoomNextRow = createSelector(
  [getQueryResults, getZoomedObjectRowIndex],
  (queryResults, rowIndex) => {
    if (!Array.isArray(queryResults) || !queryResults.length) {
      return;
    }
    const rowCount = queryResults[0].data.rows.length;
    return rowIndex !== rowCount - 1;
  },
);

export const getZoomRow = createSelector(
  [getQueryResults, getZoomedObjectRowIndex],
  (queryResults, rowIndex) => {
    if (!Array.isArray(queryResults) || !queryResults.length) {
      return;
    }
    return queryResults[0].data.rows[rowIndex];
  },
);

const isZoomingRow = createSelector(
  [getZoomedObjectId],
  index => index != null,
);

export const getMode = createSelector(
  [getLastRunQuestion],
  question => question && getQuestionMode(question),
);

export const getIsObjectDetail = createSelector(
  [getMode, isZoomingRow],
  (mode, isZoomingSingleRow) => isZoomingSingleRow || mode?.name() === "object",
);

export const getIsDirty = createSelector(
  [getQuestion, getOriginalQuestion],
  (question, originalQuestion) => {
    // When viewing a dataset, its dataset_query is swapped with a clean query using the dataset as a source table
    // (it's necessary for datasets to behave like tables opened in simple mode)
    // We need to escape the isDirty check as it will always be true in this case,
    // and the page will always be covered with a 'rerun' overlay.
    // Once the dataset_query changes, the question will loose the "dataset" flag and it'll work normally
    if (!question || isAdHocModelQuestion(question, originalQuestion)) {
      return false;
    }
    return question.isDirtyComparedToWithoutParameters(originalQuestion);
  },
);

export const getIsSavedQuestionChanged = createSelector(
  [getQuestion, getOriginalQuestion],
  (question, originalQuestion) => {
    const isSavedQuestion = originalQuestion != null;
    const hasChanges = question != null;
    const wereChangesSaved = question?.isSaved();
    const hasUnsavedChanges = hasChanges && !wereChangesSaved;

    return (
      isSavedQuestion &&
      hasUnsavedChanges &&
      originalQuestion.type() === "question"
    );
  },
);

export const getIsRunnable = createSelector(
  [getQuestion, getIsDirty],
  (question, isDirty) => {
    if (!question) {
      return false;
    }
    if (!question.isSaved() || isDirty) {
      const { isEditable } = Lib.queryDisplayInfo(question.query());
      return question.canRun() && isEditable;
    }
    return question.canRun();
  },
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

export const isResultsMetadataDirty = createSelector(
  [getMetadataDiff],
  metadataDiff => {
    return Object.keys(metadataDiff).length > 0;
  },
);

export const getShouldShowUnsavedChangesWarning = createSelector(
  [
    getQueryBuilderMode,
    getIsDirty,
    isResultsMetadataDirty,
    getQuestion,
    getOriginalQuestion,
    getUiControls,
  ],
  (
    queryBuilderMode,
    isDirty,
    isMetadataDirty,
    question,
    originalQuestion,
    uiControls,
  ) => {
    const isEditingModelOrMetric = queryBuilderMode === "dataset";

    if (isEditingModelOrMetric) {
      return isDirty || isMetadataDirty;
    }

    const isNative =
      question && Lib.queryDisplayInfo(question.query()).isNative;

    if (isNative) {
      const isNewQuestion = !originalQuestion;
      const rawQuery = Lib.rawNativeQuery(question.query());

      if (isNewQuestion) {
        return rawQuery.length > 0;
      }

      const rawOriginalQuery = Lib.rawNativeQuery(originalQuestion.query());
      const hasQueryChanged = rawQuery !== rawOriginalQuery;
      return hasQueryChanged;
    }

    const isOriginalQuestionNative =
      originalQuestion &&
      Lib.queryDisplayInfo(originalQuestion.query()).isNative;

    if (!isOriginalQuestionNative) {
      return uiControls.isModifiedFromNotebook;
    }

    return false;
  },
);

/**
 * Returns the card and query results data in a format that `Visualization.jsx` expects
 */
export const getRawSeries = createSelector(
  [
    getQuestion,
    getFirstQueryResult,
    getLastRunDatasetQuery,
    getIsShowingRawTable,
  ],
  (question, queryResult, lastRunDatasetQuery, isShowingRawTable) => {
    const rawSeries = createRawSeries({
      question,
      queryResult,
      datasetQuery: lastRunDatasetQuery,
    });
    if (isShowingRawTable && rawSeries?.length > 0) {
      const [{ card, data }] = rawSeries;
      return [
        {
          card: {
            ...card,
            display: "table",
            visualization_settings: {
              ...card.visualization_settings,
              "table.pivot": false,
            },
          },
          data,
        },
      ];
    }
    return rawSeries;
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
  question => question && Lib.queryDisplayInfo(question.query()).isNative,
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

export const getIsTimeseries = createSelector(
  [getVisualizationSettings],
  settings => settings && isTimeseries(settings),
);

export const getTimeseriesXValues = createSelector(
  [getIsTimeseries, getTransformedSeries, getVisualizationSettings],
  (isTimeseries, series, settings) =>
    isTimeseries && series && settings && getXValues({ series, settings }),
);

const getTimeseriesDataInterval = createSelector(
  [
    getTransformedSeries,
    getVisualizationSettings,
    getIsTimeseries,
    getTimeseriesXValues,
  ],
  (series, settings, isTimeseries, xValues) => {
    if (!isTimeseries || !xValues) {
      return null;
    }
    const columns = series[0]?.data?.cols ?? [];
    const dimensions = settings?.["graph.dimensions"] ?? [];
    const dimensionColumns = dimensions.map(dimension =>
      columns.find(column => column.name === dimension),
    );
    const columnUnits = dimensionColumns
      .map(column =>
        isAbsoluteDateTimeUnit(column?.unit) ? column.unit : null,
      )
      .filter(isNotNull);
    return computeTimeseriesDataInverval(
      xValues,
      minTimeseriesUnit(columnUnits),
    );
  },
);

export const getTimeseriesXDomain = createSelector(
  [getIsTimeseries, getTimeseriesXValues],
  (isTimeseries, xValues) => {
    return (
      isTimeseries &&
      Array.isArray(xValues) &&
      xValues.length > 0 &&
      d3.extent(xValues)
    );
  },
);

export const getFetchedTimelines = createSelector([getEntities], entities => {
  const entityQuery = { include: "events" };
  return Timelines.selectors.getList({ entities }, { entityQuery }) ?? [];
});

export const getTransformedTimelines = createSelector(
  [getFetchedTimelines],
  timelines => {
    return getSortedTimelines(
      timelines.map(timeline =>
        updateIn(timeline, ["events"], (events = []) =>
          _.chain(events)
            .map(event => updateIn(event, ["timestamp"], parseTimestamp))
            .filter(event => !event.archived)
            .value(),
        ),
      ),
    );
  },
);

function isEventWithinDomain(event, xDomain) {
  return event.timestamp.isBetween(xDomain[0], xDomain[1], undefined, "[]");
}

function getXDomainForTimelines(xDomain, dataInterval) {
  // When looking at, let's say, count of orders over years, last year value is Jan 1, 2024
  // If we filter timeline events up until Jan 1, 2024, we won't see any events from 2024,
  // so we need to extend xDomain by dataInterval.count * dataInterval.unit to include them
  if (xDomain && isAbsoluteDateTimeUnit(dataInterval?.unit)) {
    let maxValue = xDomain[1]
      .clone()
      .add(dataInterval.count, dataInterval.unit);

    if (dataInterval.unit !== "hour" && dataInterval.unit !== "minute") {
      maxValue = maxValue.subtract(1, "day");
    }

    return [xDomain[0], maxValue];
  }

  return xDomain;
}

export const getFilteredTimelines = createSelector(
  [getTransformedTimelines, getTimeseriesXDomain, getTimeseriesDataInterval],
  (timelines, xDomain, dataInterval) => {
    const timelineXDomain = getXDomainForTimelines(xDomain, dataInterval);
    return timelines
      .map(timeline =>
        updateIn(timeline, ["events"], events =>
          xDomain
            ? events.filter(event =>
                isEventWithinDomain(event, timelineXDomain),
              )
            : events,
        ),
      )
      .filter(timeline => timeline.events.length > 0);
  },
);

export const getVisibleTimelineEvents = createSelector(
  [getFilteredTimelines, getVisibleTimelineEventIds],
  (timelines, visibleTimelineEventIds) =>
    _.chain(timelines)
      .map(timeline => timeline.events)
      .flatten()
      .filter(event => visibleTimelineEventIds.includes(event.id))
      .sortBy(event => event.timestamp)
      .value(),
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

export const isBasedOnExistingQuestion = createSelector(
  [getOriginalQuestion],
  originalQuestion => {
    return originalQuestion != null;
  },
);

export const getDocumentTitle = createSelector(
  [getLoadingControls],
  loadingControls => loadingControls?.documentTitle,
);

export const getPageFavicon = createSelector(
  [getLoadingControls],
  loadingControls =>
    loadingControls?.showLoadCompleteFavicon
      ? LOAD_COMPLETE_FAVICON
      : undefined,
);

export const getTimeoutId = createSelector(
  [getLoadingControls],
  loadingControls => loadingControls.timeoutId,
);

export const getIsHeaderVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => !isEmbedded || embedOptions.header,
);

export const getIsActionListVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => !isEmbedded || embedOptions.action_buttons,
);

export const getIsAdditionalInfoVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => !isEmbedded || embedOptions.additional_info,
);

export const getCardAutocompleteResultsFn = state => {
  return function autocompleteResults(query) {
    const dbId = state.qb.card?.dataset_query?.database;
    if (!dbId) {
      return [];
    }

    const apiCall = MetabaseApi.db_card_autocomplete_suggestions({
      dbId,
      query,
    });
    return apiCall;
  };
};

export const getAutocompleteResultsFn = state => {
  const matchStyle = getSetting(state, "native-query-autocomplete-match-style");

  if (matchStyle === "off") {
    return null;
  }

  return function autocompleteResults(query) {
    const dbId = state.qb.card?.dataset_query?.database;
    if (!dbId) {
      return [];
    }

    const apiCall = MetabaseApi.db_autocomplete_suggestions({
      dbId,
      query,
      matchStyle,
    });
    return apiCall;
  };
};

export const getDataReferenceStack = createSelector(
  [getUiControls, getDatabaseId],
  (uiControls, dbId) =>
    uiControls.dataReferenceStack
      ? uiControls.dataReferenceStack
      : dbId
      ? [{ type: "database", item: { id: dbId } }]
      : [],
);

export const getDashboardId = state => {
  return state.qb.parentDashboard.dashboardId;
};

export const getIsEditingInDashboard = state => {
  return state.qb.parentDashboard.isEditing;
};

export const getDashboard = state => {
  return getDashboardById(state, getDashboardId(state));
};

export const getTemplateTags = createSelector([getCard], card =>
  getIn(card, ["dataset_query", "native", "template-tags"]),
);

export const getEmbeddingParameters = createSelector([getCard], card => {
  if (!card?.enable_embedding) {
    return {};
  }

  return card.embedding_params ?? {};
});

// Embeddings might be published without passing embedding_params to the server,
// in which case it's an empty object. We should treat such situations with
// caution, assuming that an absent parameter is "disabled".
export function getEmbeddedParameterVisibility(state, slug) {
  const card = getCard(state);
  if (!card?.enable_embedding) {
    return null;
  }

  const embeddingParams = card.embedding_params ?? {};
  return embeddingParams[slug] ?? "disabled";
}

export const getSubmittableQuestion = (state, question) => {
  const rawSeries = createRawSeries({
    question: getQuestion(state),
    queryResult: getFirstQueryResult(state),
    datasetQuery: getLastRunDatasetQuery(state),
  });

  const series = rawSeries
    ? getVisualizationTransformed(extractRemappings(rawSeries)).series
    : null;

  const resultsMetadata = getResultsMetadata(state);
  const isResultDirty = getIsResultDirty(state);

  if (question.type() === "model" && resultsMetadata) {
    resultsMetadata.columns = cleanIndexFlags(resultsMetadata.columns);
  }

  let submittableQuestion = question;

  if (series) {
    submittableQuestion = getQuestionWithDefaultVisualizationSettings(
      submittableQuestion,
      series,
    );
  }

  const cleanQuery = Lib.dropEmptyStages(submittableQuestion.query());
  submittableQuestion = submittableQuestion
    .setQuery(cleanQuery)
    .setResultsMetadata(isResultDirty ? null : resultsMetadata);

  return submittableQuestion;
};

export const getIsNotebookNativePreviewShown = state =>
  getSetting(state, "notebook-native-preview-shown");

export const getNotebookNativePreviewSidebarWidth = state =>
  getSetting(state, "notebook-native-preview-sidebar-width");
