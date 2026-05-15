import { createAction } from "redux-actions";
import { t } from "ttag";

import { isAbortError } from "metabase/api/legacy-client";
import { runQuestionQuery as apiRunQuestionQuery } from "metabase/querying/run-query";
import { syncVizSettingsWithSeries } from "metabase/querying/viz-settings/utils/sync-viz-settings";
import { createThunkAction } from "metabase/redux";
import {
  CANCEL_QUERY,
  QUERY_COMPLETED as QUERY_COMPLETED_TYPE,
  QUERY_ERRORED as QUERY_ERRORED_TYPE,
  RUN_QUERY as RUN_QUERY_TYPE,
  SET_DOCUMENT_TITLE,
  SET_DOCUMENT_TITLE_TIMEOUT_ID,
  SET_SHOW_LOADING_COMPLETE_FAVICON,
} from "metabase/redux/query-builder";
import type { Dispatch, GetState } from "metabase/redux/store";
import { getWhiteLabeledLoadingMessageFactory } from "metabase/selectors/whitelabel";
import { getSensibleDisplays } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isAdHocModelOrMetricQuestion } from "metabase-lib/v1/metadata/utils/models";
import type { Dataset } from "metabase-types/api";

import {
  getAllNativeEditorSelectedText,
  getCard,
  getFirstQueryResult,
  getIsResultDirty,
  getIsRunning,
  getOriginalQuestion,
  getOriginalQuestionWithParameterValues,
  getQueryResults,
  getQuestion,
  getTimeoutId,
} from "../selectors";

import { updateUrl } from "./url";

const setDocumentTitle = createAction(SET_DOCUMENT_TITLE);

const showLoadingCompleteFavicon = createAction(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  () => true,
);
const hideLoadingCompleteFavicon = createAction(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  () => false,
);

const LOAD_START_UI_CONTROLS = "metabase/qb/LOAD_START_UI_CONTROLS";
const LOAD_COMPLETE_UI_CONTROLS = "metabase/qb/LOAD_COMPLETE_UI_CONTROLS";
const LOAD_ERROR_UI_CONTROLS = "metabase/qb/LOAD_ERROR_UI_CONTROLS";
const setDocumentTitleTimeoutId = createAction(SET_DOCUMENT_TITLE_TIMEOUT_ID);

const loadCompleteUIControls = createThunkAction(
  LOAD_COMPLETE_UI_CONTROLS,
  () => (dispatch, getState) => {
    const timeoutId = getTimeoutId(getState());
    clearTimeout(timeoutId);
    dispatch(showLoadingCompleteFavicon());
    if (document.hidden) {
      dispatch(setDocumentTitle(t`Your question is ready!`));
      document.addEventListener(
        "visibilitychange",
        () => {
          dispatch(setDocumentTitle(""));
          setTimeout(() => {
            dispatch(hideLoadingCompleteFavicon());
          }, 3000);
        },
        { once: true },
      );
    } else {
      dispatch(setDocumentTitle(""));
      setTimeout(() => {
        dispatch(hideLoadingCompleteFavicon());
      }, 3000);
    }
  },
);

const loadErrorUIControls = createThunkAction(
  LOAD_ERROR_UI_CONTROLS,
  () => (dispatch, getState) => {
    const timeoutId = getTimeoutId(getState());
    clearTimeout(timeoutId);
    dispatch(setDocumentTitle(""));
  },
);

type RunDirtyQuestionQueryOpts = {
  shouldUpdateUrl?: boolean;
};

export const runDirtyQuestionQuery =
  ({ shouldUpdateUrl }: RunDirtyQuestionQueryOpts = {}) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const areResultsDirty = getIsResultDirty(getState());
    const queryResults = getQueryResults(getState());

    if (queryResults && !areResultsDirty) {
      const question = getQuestion(getState());

      if (!question) {
        return;
      }

      return dispatch(queryCompleted(question, queryResults));
    }

    return dispatch(runQuestionQuery({ shouldUpdateUrl }));
  };

// Cancel deferred for any in-progress background stale refresh. Resolved when
// the user triggers a new explicit run so the stale refresh doesn't clobber
// the running state.
let _staleRefreshCancelDeferred: ReturnType<typeof defer> | null = null;

/**
 * Queries the result for the currently active question or alternatively for the card question provided in `overrideWithQuestion`.
 * The API queries triggered by this action creator can be cancelled using the deferred provided in RUN_QUERY action.
 */
export const runQuestionQuery = ({
  shouldUpdateUrl = true,
  ignoreCache = false,
  overrideWithQuestion = null,
}: {
  shouldUpdateUrl?: boolean;
  ignoreCache?: boolean;
  overrideWithQuestion?: Question | null;
} = {}) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    // Cancel any silent background stale refresh before showing the running overlay.
    if (_staleRefreshCancelDeferred) {
      _staleRefreshCancelDeferred.resolve();
      _staleRefreshCancelDeferred = null;
    }
    dispatch(loadStartUIControls());

    const question = overrideWithQuestion
      ? overrideWithQuestion
      : getQuestion(getState());
    const originalQuestion = getOriginalQuestion(getState());

    if (!question) {
      return;
    }

    const isCardDirty = originalQuestion
      ? question.isDirtyComparedToWithoutParameters(originalQuestion) ||
        question.id() == null
      : true;

    const isQueryDirty = originalQuestion
      ? question.isQueryDirtyComparedTo(originalQuestion)
      : true;

    if (shouldUpdateUrl) {
      const isAdHocModelOrMetric = isAdHocModelOrMetricQuestion(
        question,
        originalQuestion,
      );

      dispatch(
        updateUrl(question, { dirty: !isAdHocModelOrMetric && isCardDirty }),
      );
    }

    const startTime = new Date();
    const cancelQueryController = new AbortController();

    apiRunQuestionQuery(question, {
      dispatch,
      signal: cancelQueryController.signal,
      ignoreCache: ignoreCache,
      isDirty: isQueryDirty,
    })
      .then((queryResults) => dispatch(queryCompleted(question, queryResults)))
      .catch((error) => dispatch(queryErrored(startTime, error)));

    dispatch({ type: RUN_QUERY_TYPE, payload: { cancelQueryController } });
  };
};

const loadStartUIControls = createThunkAction(
  LOAD_START_UI_CONTROLS,
  () => (dispatch, getState) => {
    const getLoadingMessage = getWhiteLabeledLoadingMessageFactory(getState());
    const loadingMessage = getLoadingMessage();

    const title = {
      onceQueryIsRun: loadingMessage,
      ifQueryTakesLong: t`Still Here...`,
    };

    dispatch(setDocumentTitle(title.onceQueryIsRun));

    const timeoutId = setTimeout(() => {
      if (document.title.includes(title.onceQueryIsRun)) {
        dispatch(setDocumentTitle(title.ifQueryTakesLong));
      }
    }, 10000);

    dispatch(setDocumentTitleTimeoutId(timeoutId));
  },
);

export const queryCompleted = (question: Question, queryResults: Dataset[]) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    const [{ data, error }] = queryResults;
    const prevCard = getCard(getState());
    const { data: prevData, error: prevError } =
      getFirstQueryResult(getState()) ?? {};

    const originalQuestion = getOriginalQuestionWithParameterValues(getState());
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    const isDirty =
      isEditable &&
      (!originalQuestion || question.isDirtyComparedTo(originalQuestion));

    if (isDirty) {
      const series = [{ card: question.card(), data, error }];
      const previousSeries =
        prevCard && prevData
          ? [{ card: prevCard, data: prevData, error: prevError }]
          : null;
      if (series && previousSeries) {
        question = question.setSettings(
          syncVizSettingsWithSeries(
            question.settings(),
            question.query(),
            series,
            previousSeries,
          ),
        );
      }

      question = question.maybeResetDisplay(
        data,
        getSensibleDisplays(data),
        prevData && getSensibleDisplays(prevData),
      );
    }

    const card = question.card();

    dispatch({
      type: QUERY_COMPLETED_TYPE,
      payload: {
        card,
        queryResults,
      },
    });
    dispatch(loadCompleteUIControls());

    if (queryResults[0]?.stale) {
      dispatch(refreshStaleQueryResult(question));
    }
  };
};

// Re-run a stale cached result silently in the background. Unlike
// runQuestionQuery, this never dispatches RUN_QUERY, so isRunning stays false
// and the "Doing science…" overlay won't cover the data that is already on
// screen. The footer's QuestionLastUpdated component shows "Refreshing…" via
// result.stale while the fresh query is in flight.
const refreshStaleQueryResult =
  (question: Question) => async (dispatch: Dispatch) => {
    _staleRefreshCancelDeferred?.resolve();
    const cancelDeferred = defer();
    _staleRefreshCancelDeferred = cancelDeferred;

    try {
      const freshResults = await apiRunQuestionQuery(question, {
        cancelDeferred,
        ignoreCache: true,
        isDirty: false,
      });
      if (_staleRefreshCancelDeferred === cancelDeferred) {
        _staleRefreshCancelDeferred = null;
      }
      // Guard against infinite loop if the server still returns stale data.
      if (!freshResults[0]?.stale) {
        dispatch(queryCompleted(question, freshResults));
      }
    } catch (error) {
      if (!(error as { isCancelled?: boolean }).isCancelled) {
        console.error("Background stale refresh failed:", error);
      }
    }
  };

export const queryErrored = createThunkAction(
  QUERY_ERRORED_TYPE,
  (startTime, error) => {
    return async (dispatch) => {
      if (isAbortError(error)) {
        return null;
      } else {
        dispatch(loadErrorUIControls());

        return { error: error, duration: Date.now() - startTime };
      }
    };
  },
);

export const cancelQuery = () => (dispatch: Dispatch, getState: GetState) => {
  const isRunning = getIsRunning(getState());
  if (isRunning) {
    const { cancelQueryController } = getState().qb;
    if (cancelQueryController) {
      cancelQueryController.abort();
    }
    dispatch(setDocumentTitle(""));

    return { type: CANCEL_QUERY };
  }
};

export const runOrCancelQuestionOrSelectedQuery =
  () => (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const isRunning = getIsRunning(getState());
    if (isRunning) {
      dispatch(cancelQuery());
      return;
    }

    const query = question.query();
    const queryInfo = Lib.queryDisplayInfo(query);
    const selectedText = getAllNativeEditorSelectedText(getState());
    if (queryInfo.isNative && selectedText) {
      const selectedQuery = Lib.withNativeQuery(query, selectedText);
      dispatch(
        runQuestionQuery({
          overrideWithQuestion: question.setQuery(selectedQuery),
          shouldUpdateUrl: false,
        }),
      );
    } else {
      dispatch(runQuestionQuery());
    }
  };
