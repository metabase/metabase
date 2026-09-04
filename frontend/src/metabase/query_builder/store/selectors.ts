/*eslint no-use-before-define: "error"*/
import { createSelector } from "@reduxjs/toolkit";
import { merge } from "icepick";
import { shallowEqual } from "react-redux";
import _ from "underscore";

import { LOAD_COMPLETE_FAVICON } from "metabase/common/hooks/constants";
import { getEmbedOptions } from "metabase/embedding/interactive-embedding";
import { getMetadata } from "metabase/metadata-store";
import {
  isQuestionDirty,
  isQuestionRunnable,
} from "metabase/querying/common/utils/question";
import { getSetting } from "metabase/settings";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import { filterTimelinesByXAxis } from "metabase/timelines/panel/utils";
import { selectIsWithinIframe } from "metabase/utils/iframe";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import {
  getCollectionTimelinesVisibility,
  getRecordedTimelineEventsVisibility,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import {
  getTimeseriesXAxis as computeTimeseriesXAxis,
  createRawSeries,
  extractRemappings,
  getComputedSettingsForSeries,
  getVisualizationTransformed,
  isTimeseries,
} from "metabase/viz-core";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import {
  normalizeParameterValue,
  normalizeParameters,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import { getIsPKFromTablePredicate } from "metabase-lib/v1/types/utils/isa";
import type {
  Bookmark,
  ColumnFormattingSetting,
  ColumnSettings,
  Dataset,
  DatasetColumn,
  DatasetQuery,
  Field,
  Series,
} from "metabase-types/api";

import { cleanIndexFlags } from "../model-indexes/actions";
import { getWritableColumnProperties } from "../utils";
import { getQuestionWithDefaultVisualizationSettings } from "../utils/viz-settings";

import {
  getCard,
  getOriginalCard,
  getOriginalQuestion,
  getParameterValues,
  getQueryBuilderMode,
  getQuestion,
  getQuestionWithoutComposing,
  getUiControls,
} from "./question-selectors";
import type { QueryBuilderStoreState } from "./state";

export {
  getCard,
  getIsSavedQuestionChanged,
  getOriginalCard,
  getOriginalQuestion,
  getParameterValues,
  getQueryBuilderMode,
  getQuestion,
  getQuestionWithoutComposing,
  getUiControls,
} from "./question-selectors";

export const getQueryStatus = (state: QueryBuilderStoreState) =>
  state.qb.queryStatus;
export const getLoadingControls = (state: QueryBuilderStoreState) =>
  state.qb.loadingControls;

export const getIsShowingTemplateTagsEditor = (state: QueryBuilderStoreState) =>
  getUiControls(state).isShowingTemplateTagsEditor;
export const getIsShowingSnippetSidebar = (state: QueryBuilderStoreState) =>
  getUiControls(state).isShowingSnippetSidebar;
export const getIsShowingDataReference = (state: QueryBuilderStoreState) =>
  getUiControls(state).isShowingDataReference;
export const getHighlightedNativeQueryLineNumbers = (
  state: QueryBuilderStoreState,
) => getUiControls(state).highlightedNativeQueryLineNumbers;

// This selector can be called from public questions / dashboards, which do not
// have state.qb
export const getIsShowingRawTable = (state: QueryBuilderStoreState) =>
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
] as const;

export const getIsAnySidebarOpen = createSelector(
  [getUiControls],
  (uiControls) => SIDEBARS.some((sidebar) => uiControls[sidebar]),
);

export const getIsRunning = (state: QueryBuilderStoreState) =>
  getUiControls(state).isRunning;
export const getIsLoadingComplete = (state: QueryBuilderStoreState) =>
  getQueryStatus(state) === "complete";

export const getLastRunCard = (state: QueryBuilderStoreState) =>
  state.qb.lastRunCard;

export const getMetadataDiff = (state: QueryBuilderStoreState) =>
  state.qb.metadataDiff;

export const getSelectedTimelineEventIds = (state: QueryBuilderStoreState) =>
  state.qb.selectedTimelineEventIds;
export const getFocusedTimelineEventIds = (state: QueryBuilderStoreState) =>
  getUiControls(state).focusedTimelineEventIds;

const getRawQueryResults = (state: QueryBuilderStoreState) =>
  state.qb.queryResults;

export const getIsBookmarked = (
  state: QueryBuilderStoreState,
  { bookmarks }: { bookmarks: Bookmark[] },
) =>
  bookmarks.some(
    (bookmark) =>
      bookmark.type === "card" && bookmark.item_id === state.qb.card?.id,
  );

export const getQueryStartTime = (state: QueryBuilderStoreState) =>
  state.qb.queryStartTime;

export const getDatabaseId = createSelector(
  [getCard],
  (card) => card && card.dataset_query && card.dataset_query.database,
);

export const getTableForeignKeyReferences = (state: QueryBuilderStoreState) =>
  state.qb.tableForeignKeyReferences;

export const getParameters = createSelector(
  [getCard, getMetadata, getParameterValues],
  (card, metadata, parameterValues) =>
    card ? getCardUiParameters(card, metadata, parameterValues) : [],
);

const getLastRunDatasetQuery = createSelector(
  [getLastRunCard],
  (card) => card && card.dataset_query,
);

export const getPreviousQueryBuilderMode = createSelector(
  [getUiControls],
  (uiControls) => uiControls.previousQueryBuilderMode,
);

export const getDatasetEditorTab = createSelector(
  [getUiControls],
  (uiControls) => uiControls.datasetEditorTab,
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

/**
 * Returns whether the current question is a native query
 */
export const getIsNative = createSelector([getQuestion], (question) =>
  question ? Lib.queryDisplayInfo(question.query()).isNative : false,
);

const getCardResultMetadata = createSelector(
  [getCard],
  (card) => card?.result_metadata,
);

const getModelMetadataDiff = createSelector(
  [getCardResultMetadata, getMetadataDiff, getQueryBuilderMode, getIsNative],
  (resultMetadata, metadataDiff, queryBuilderMode, isNative) => {
    if (!resultMetadata || queryBuilderMode !== "dataset") {
      return metadataDiff;
    }

    return {
      ...metadataDiff,
      ...Object.fromEntries(
        resultMetadata.map((column) => [
          column.name,
          {
            ...getWritableColumnProperties(column, isNative),
            ...metadataDiff[column.name],
          },
        ]),
      ),
    };
  },
);

export const getQueryResults = createSelector(
  [getRawQueryResults, getModelMetadataDiff],
  (queryResults, metadataDiff): Dataset[] | null => {
    if (!Array.isArray(queryResults) || !queryResults.length) {
      return null;
    }

    const [result] = queryResults;
    if (result.error || !result?.data?.results_metadata) {
      return queryResults;
    }
    const { cols, results_metadata } = result.data;

    function applyMetadataDiff<T extends DatasetColumn | Field>(column: T): T {
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

export const getFirstQueryResult = createSelector(
  [getQueryResults],
  (results) => (Array.isArray(results) ? results[0] : null),
);

const getLastRunParameters = createSelector(
  [getFirstQueryResult],
  (queryResult) =>
    (queryResult &&
      queryResult.json_query &&
      queryResult.json_query.parameters) ||
    [],
);

const getLastRunParameterValues = createSelector(
  [getLastRunParameters],
  (parameters) => parameters.map((parameter) => parameter.value),
);
const getNextRunParameterValues = createSelector(
  [getParameters],
  (parameters) =>
    parameters.map((parameter) =>
      // parameters are "normalized" immediately before a query run, so in order
      // to compare current parameters to previously-used parameters we need
      // to run parameters through this normalization function
      normalizeParameterValue(parameter.type, parameter.value),
    ),
);

export const getNextRunParameters = createSelector(
  [getParameters],
  (parameters) => normalizeParameters(parameters),
);

export const getTableId = createSelector([getQuestion], (question) => {
  if (!question) {
    return;
  }

  return Lib.sourceTableOrCardId(question.query());
});

export const getTableMetadata = createSelector(
  [getTableId, getMetadata],
  (tableId, metadata) => metadata.table(tableId),
);

export const getTableForeignKeys = createSelector(
  [getTableMetadata],
  (table) => {
    const tableForeignKeys = table?.fks ?? [];
    const tableForeignKeysWithoutHiddenTables = tableForeignKeys.filter(
      (tableForeignKey) => tableForeignKey.origin != null,
    );

    return tableForeignKeysWithoutHiddenTables;
  },
);

export const getPKColumnIndex = createSelector(
  [getFirstQueryResult, getTableId],
  (result, tableId) => {
    if (!result || !result.data) {
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

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export const getPKRowIndexMap = createSelector(
  [getFirstQueryResult, getPKColumnIndex],
  (result, PKColumnIndex) => {
    if (!result || !result.data || !isSafeInteger(PKColumnIndex)) {
      return {};
    }
    const { rows } = result.data;
    if (PKColumnIndex < 0) {
      return rows.map((_, index) => index);
    }
    const map: Record<ObjectId, number> = {};
    rows.forEach((row, index) => {
      // TODO(romeovs): ObjectId should probably be RowValue
      const PKValue = row[PKColumnIndex] as ObjectId;
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
    if (!result || !isSafeInteger(PKColumnIndex)) {
      return {};
    }
    const { rows } = result.data;
    if (PKColumnIndex < 0) {
      return rows.map((_, index) => index);
    }
    const map: Record<number, ObjectId> = {};
    rows.forEach((row, index) => {
      const PKValue = row[PKColumnIndex];
      // TODO(romeovs): remove this cast once we have a proper type for ObjectId
      map[index] = PKValue as ObjectId;
    });
    return map;
  },
);

function areLegacyQueriesEqual(
  queryA: DatasetQuery | undefined,
  queryB: DatasetQuery | undefined,
  tableMetadata?: Table | null,
) {
  if (queryA == null || queryB == null) {
    return false;
  }
  return Lib.areLegacyQueriesEqual(
    queryA,
    queryB,
    tableMetadata?.fields
      ?.map(({ id }) => id)
      ?.filter((id): id is number => typeof id === "number") ?? [],
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
}: {
  originalQuestion?: Question | null;
  lastRunQuestion?: Question | null;
  currentQuestion?: Question | null;
  tableMetadata?: Table | null;
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

export function areQueriesEquivalent({
  originalQuestion,
  lastRunQuestion,
  currentQuestion,
  tableMetadata,
}: {
  originalQuestion?: Question | null;
  lastRunQuestion?: Question | null;
  currentQuestion?: Question | null;
  tableMetadata?: Table | null;
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
    currentQuestion,
    originalQuestion,
    lastRunQuestion,
    lastParameters,
    nextParameters,
    tableMetadata,
  ) => {
    const haveParametersChanged = !_.isEqual(lastParameters, nextParameters);
    const isEditable =
      !!currentQuestion &&
      Lib.queryDisplayInfo(currentQuestion.query()).isEditable;
    return Boolean(
      haveParametersChanged ||
      (isEditable &&
        !areQueriesEquivalent({
          originalQuestion,
          lastRunQuestion,
          currentQuestion,
          tableMetadata,
        })),
    );
  },
);

export const getZoomedObjectId = (state: QueryBuilderStoreState) =>
  state.qb.zoomedRowObjectId;

export const getZoomedObjectRowIndex = createSelector(
  [getPKRowIndexMap, getZoomedObjectId],
  (PKRowIndexMap, objectId) => {
    if (!PKRowIndexMap || objectId == null) {
      return;
    }

    const parsedObjectId =
      typeof objectId === "string" ? parseInt(objectId) : objectId;

    if (Array.isArray(PKRowIndexMap)) {
      return PKRowIndexMap[parsedObjectId];
    }

    return PKRowIndexMap[parsedObjectId] ?? PKRowIndexMap[objectId];
  },
);

export const getPreviousRowPKValue = createSelector(
  [getFirstQueryResult, getPKColumnIndex, getZoomedObjectRowIndex],
  (result, PKColumnIndex, rowIndex) => {
    if (!result || rowIndex == null || !isSafeInteger(PKColumnIndex)) {
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
    if (!result || rowIndex == null || !isSafeInteger(PKColumnIndex)) {
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
  (rowIndex) => rowIndex !== 0,
);

export const getCanZoomNextRow = createSelector(
  [getQueryResults, getZoomedObjectRowIndex],
  (queryResults, rowIndex) => {
    if (
      !Array.isArray(queryResults) ||
      !queryResults.length ||
      !queryResults[0].data
    ) {
      return;
    }
    const rowCount = queryResults[0].data.rows.length;
    return rowIndex !== rowCount - 1;
  },
);

export const getZoomRow = createSelector(
  [getQueryResults, getZoomedObjectRowIndex],
  (queryResults, rowIndex) => {
    if (
      !Array.isArray(queryResults) ||
      !queryResults.length ||
      rowIndex == null
    ) {
      return;
    }

    return queryResults[0].data.rows[rowIndex];
  },
);

export const getIsDirty = createSelector(
  [getQuestion, getOriginalQuestion],
  isQuestionDirty,
);

export const getIsRunnable = createSelector(
  [getQuestion, getIsDirty],
  isQuestionRunnable,
);

export const getResultsMetadata = createSelector(
  [getFirstQueryResult],
  (result) => result && result.data && result.data.results_metadata,
);

export const isResultsMetadataDirty = createSelector(
  [getMetadataDiff],
  (metadataDiff) => {
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

// the card's dataset_query is updated on every native query keystroke
// but getRawSeries doesn't usually use the updated dataset_query (it prefers lastRunDatasetQuery)
// so we use this equality check to avoid re-rendering the visualization on every keystroke
function areRawSeriesEqual(a: Series | null, b: Series | null) {
  if (a === b) {
    return true;
  }
  if (a == null || b == null || a.length !== 1 || b.length !== 1) {
    return false;
  }
  const {
    card: {
      visualization_settings: settingsA,
      parameters: parametersA,
      ...cardRestA
    },
    ...restA
  } = a[0];
  const {
    card: {
      visualization_settings: settingsB,
      parameters: parametersB,
      ...cardRestB
    },
    ...restB
  } = b[0];
  return (
    shallowEqual(restA, restB) &&
    // getRawSeries creates new cards and visualization_settings
    shallowEqual(cardRestA, cardRestB) &&
    shallowEqual(settingsA, settingsB) &&
    // applyTemplateTagParameters creates completely new parameters - we need deep equality here
    _.isEqual(parametersA, parametersB)
  );
}

const EMPTY_COLUMN_FORMATTING: ColumnFormattingSetting[] = [];
const EMPTY_COLUMN_SETTINGS: ColumnSettings = {};

/**
 * Returns the card and query results data in a format that `Visualization.jsx` expects
 */
export const getRawSeries = createSelector(
  [getCard, getFirstQueryResult, getLastRunDatasetQuery, getIsShowingRawTable],
  (
    card,
    queryResult,
    lastRunDatasetQuery,
    isShowingRawTable,
  ): Series | null => {
    if (card == null) {
      return null;
    }
    const rawSeries = createRawSeries({
      card,
      queryResult,
      datasetQuery: lastRunDatasetQuery,
    });
    if (isShowingRawTable && rawSeries != null && rawSeries.length > 0) {
      const [{ card, ...rest }] = rawSeries;
      return [
        {
          ...rest,
          card: {
            ...card,
            display: "table",
            visualization_settings: {
              ...card.visualization_settings,
              "table.pivot": false,
              "table.column_formatting": EMPTY_COLUMN_FORMATTING,
              column_settings: EMPTY_COLUMN_SETTINGS,
            },
          },
        },
      ];
    }
    return rawSeries;
  },
  {
    memoizeOptions: {
      resultEqualityCheck: areRawSeriesEqual,
    },
  },
);

const _getVisualizationTransformed = createSelector(
  [getRawSeries],
  (rawSeries) =>
    rawSeries && getVisualizationTransformed(extractRemappings(rawSeries)),
);

/**
 * Returns the final series data that all visualization (starting from the root-level
 * `Visualization.jsx` component) code uses for rendering visualizations.
 */
export const getTransformedSeries = createSelector(
  [_getVisualizationTransformed],
  (transformed) => transformed?.series,
);

export const getTransformedVisualization = createSelector(
  [_getVisualizationTransformed],
  (transformed) => transformed?.visualization,
);

/**
 * Returns complete visualization settings (including default values for those settings which aren't explicitly set)
 */
export const getVisualizationSettings = createSelector(
  [getTransformedSeries],
  (series) => series && getComputedSettingsForSeries(series),
);

/**
 * Returns whether the native query editor is open
 */
export const getIsNativeEditorOpen = createSelector(
  [getIsNative, getUiControls],
  (isNative, uiControls) => isNative && uiControls.isNativeEditorOpen,
);

export const getNativeEditorSelectedRange = createSelector(
  [getUiControls],
  (uiControls) => uiControls?.nativeEditorSelectedRange?.[0],
);

const getNativeEditorSelectedRanges = createSelector(
  [getUiControls],
  (uiControls) => uiControls?.nativeEditorSelectedRange,
);

export const getIsTimeseries = createSelector(
  [getVisualizationSettings],
  (settings) => settings && isTimeseries(settings),
);

export const getTimeseriesXAxis = createSelector(
  [getTransformedSeries, getVisualizationSettings],
  (series, settings) =>
    series && settings ? computeTimeseriesXAxis(series, settings) : null,
);

const getFilteredTimelines = createSelector(
  [getTransformedTimelines, getTimeseriesXAxis],
  filterTimelinesByXAxis,
);

export const getTimelineEventsVisibility = createSelector(
  [
    (state: QueryBuilderStoreState) =>
      getRecordedTimelineEventsVisibility(getQuestion(state)?.settings()),
    (state: QueryBuilderStoreState) => getQuestion(state)?.collectionId(),
    getTransformedTimelines,
  ],
  (savedVisibility, collectionId, timelines) =>
    savedVisibility ??
    getCollectionTimelinesVisibility(timelines, collectionId),
);

export const getVisibleTimelineEvents = createSelector(
  [getFilteredTimelines, getTimelineEventsVisibility],
  (timelines, visibility) =>
    resolveVisibleTimelineEvents({ timelines, visibility }),
);

export const getVisibleTimelineEventIds = createSelector(
  [getVisibleTimelineEvents],
  (events) => events.map((event) => event.id),
);

export function getOffsetForQueryAndPosition(
  queryText: string,
  { row, column }: { row: number; column: number },
) {
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
  [getNativeEditorSelectedRange, getQuestionWithoutComposing],
  (selectedRange, question) => {
    if (selectedRange == null || question == null || !question.isNative()) {
      return null;
    }
    const query = question.query();
    const queryText = Lib.rawNativeQuery(query);
    return getOffsetForQueryAndPosition(queryText, selectedRange.end);
  },
);

export const getNativeEditorSelectedText = createSelector(
  [getNativeEditorSelectedRange, getQuestionWithoutComposing],
  (selectedRange, question) => {
    if (selectedRange == null || question == null || !question.isNative()) {
      return null;
    }
    const query = question.query();
    const queryText = Lib.rawNativeQuery(query);
    const start = getOffsetForQueryAndPosition(queryText, selectedRange.start);
    const end = getOffsetForQueryAndPosition(queryText, selectedRange.end);
    return queryText.slice(start, end);
  },
);

export const getAllNativeEditorSelectedText = createSelector(
  [getNativeEditorSelectedRanges, getQuestionWithoutComposing],
  (selectedRanges, question) => {
    if (
      selectedRanges == null ||
      selectedRanges.length === 0 ||
      question == null ||
      !question.isNative()
    ) {
      return null;
    }
    const query = question.query();
    const queryText = Lib.rawNativeQuery(query);
    const selectedText = selectedRanges.map((range) =>
      queryText.slice(
        getOffsetForQueryAndPosition(queryText, range.start),
        getOffsetForQueryAndPosition(queryText, range.end),
      ),
    );
    return selectedText.join("");
  },
);

export const getModalSnippet = createSelector(
  [getUiControls],
  (uiControls) => uiControls?.modalSnippet,
);

export const getSnippetCollectionId = createSelector(
  [getUiControls],
  (uiControls) => uiControls?.snippetCollectionId,
);

export const getIsVisualized = createSelector(
  [getQuestion, getVisualizationSettings],
  (question, settings) =>
    question &&
    // table is the default
    ((question.display() !== "table" &&
      question.display() !== "pivot" &&
      question.display() !== "list") ||
      (settings != null &&
        (settings["table.pivot"] ||
          (question.display() === "table" && settings["table.pivot_column"])))), // last case - pivot_column is set but display is set to table viz (#56094)
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
  (uiControls) => uiControls?.questionDetailsTimelineDrawerState,
);

export const isBasedOnExistingQuestion = createSelector(
  [getOriginalQuestion],
  (originalQuestion) => {
    return originalQuestion != null;
  },
);

export const getDocumentTitle = createSelector(
  [getLoadingControls],
  (loadingControls) => loadingControls?.documentTitle,
);

export const getPageFavicon = createSelector(
  [getLoadingControls],
  (loadingControls) =>
    loadingControls?.showLoadCompleteFavicon
      ? LOAD_COMPLETE_FAVICON
      : undefined,
);

export const getTimeoutId = createSelector(
  [getLoadingControls],
  (loadingControls) => loadingControls.timeoutId,
);

export const getIsHeaderVisible = createSelector(
  [selectIsWithinIframe, getEmbedOptions],
  (isEmbeddingIframe, embedOptions) =>
    !isEmbeddingIframe || embedOptions.header,
);

export const getIsActionListVisible = createSelector(
  [selectIsWithinIframe, getEmbedOptions],
  (isEmbeddingIframe, embedOptions) =>
    !isEmbeddingIframe || embedOptions.action_buttons,
);

export const getIsAdditionalInfoVisible = createSelector(
  [selectIsWithinIframe, getEmbedOptions],
  (isEmbeddingIframe, embedOptions) =>
    !isEmbeddingIframe || embedOptions.additional_info,
);

export const getDataReferenceStack = createSelector(
  [getUiControls, getDatabaseId],
  (uiControls, dbId) =>
    uiControls.dataReferenceStack
      ? uiControls.dataReferenceStack
      : dbId
        ? [{ type: "database", id: dbId }]
        : [],
);

export const getIsEditingInDashboard = (state: QueryBuilderStoreState) => {
  return (
    state.qb.parentEntity.model === "dashboard" &&
    state.qb.parentEntity.isEditing
  );
};

export const getParentEntity = (state: QueryBuilderStoreState) => {
  return state.qb.parentEntity;
};

export const getEmbeddingParameters = createSelector([getCard], (card) => {
  if (!card?.enable_embedding) {
    return {};
  }

  return card.embedding_params ?? {};
});

// Embeddings might be published without passing embedding_params to the server,
// in which case it's an empty object. We should treat such situations with
// caution, assuming that an absent parameter is "disabled".
export function getEmbeddedParameterVisibility(
  state: QueryBuilderStoreState,
  slug: string,
) {
  const card = getCard(state);
  if (!card?.enable_embedding) {
    return null;
  }

  const embeddingParams = card.embedding_params ?? {};
  return embeddingParams[slug] ?? "disabled";
}

export const getSubmittableQuestion = (
  state: QueryBuilderStoreState,
  question: Question,
) => {
  const card = getCard(state) ?? question.card();
  const rawSeries = createRawSeries({
    card,
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

export const getNotebookNativePreviewSidebarWidth = (
  state: QueryBuilderStoreState,
) => getSetting(state, "notebook-native-preview-sidebar-width");

export const getIsListViewConfigurationShown = createSelector(
  [getUiControls],
  (uiControls) => uiControls.isShowingListViewConfiguration,
);
