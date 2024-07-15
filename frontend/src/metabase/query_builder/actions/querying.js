import { createAction } from "redux-actions";
import { t } from "ttag";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { startTimer } from "metabase/lib/performance";
import { defer } from "metabase/lib/promise";
import { createThunkAction } from "metabase/lib/redux";
import { syncVizSettingsWithSeries } from "metabase/querying";
import { getWhiteLabeledLoadingMessageFactory } from "metabase/selectors/whitelabel";
import { runQuestionQuery as apiRunQuestionQuery } from "metabase/services";
import { getSensibleDisplays } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import { isAdHocModelQuestion } from "metabase-lib/v1/metadata/utils/models";

import {
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

import { updateUrl } from "./navigation";

export const SET_DOCUMENT_TITLE = "metabase/qb/SET_DOCUMENT_TITLE";
const setDocumentTitle = createAction(SET_DOCUMENT_TITLE);

export const SET_SHOW_LOADING_COMPLETE_FAVICON =
  "metabase/qb/SET_SHOW_LOADING_COMPLETE_FAVICON";
const showLoadingCompleteFavicon = createAction(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  () => true,
);
const hideLoadingCompleteFavicon = createAction(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
  () => false,
);

const LOAD_COMPLETE_UI_CONTROLS = "metabase/qb/LOAD_COMPLETE_UI_CONTROLS";
const LOAD_START_UI_CONTROLS = "metabase/qb/LOAD_START_UI_CONTROLS";
export const SET_DOCUMENT_TITLE_TIMEOUT_ID =
  "metabase/qb/SET_DOCUMENT_TITLE_TIMEOUT_ID";
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

export const runDirtyQuestionQuery = () => async (dispatch, getState) => {
  const areResultsDirty = getIsResultDirty(getState());
  const queryResults = getQueryResults(getState());
  const hasResults = !!queryResults;

  if (hasResults && !areResultsDirty) {
    const question = getQuestion(getState());
    return dispatch(queryCompleted(question, queryResults));
  }

  return dispatch(runQuestionQuery());
};

/**
 * Queries the result for the currently active question or alternatively for the card question provided in `overrideWithQuestion`.
 * The API queries triggered by this action creator can be cancelled using the deferred provided in RUN_QUERY action.
 */
export const RUN_QUERY = "metabase/qb/RUN_QUERY";
export const runQuestionQuery = ({
  shouldUpdateUrl = true,
  ignoreCache = false,
  overrideWithQuestion = null,
} = {}) => {
  return async (dispatch, getState) => {
    dispatch(loadStartUIControls());

    const question = overrideWithQuestion
      ? overrideWithQuestion
      : getQuestion(getState());
    const originalQuestion = getOriginalQuestion(getState());

    const isCardDirty = originalQuestion
      ? question.isDirtyComparedToWithoutParameters(originalQuestion) ||
        question.id() == null
      : true;

    const isQueryDirty = originalQuestion
      ? question.isQueryDirtyComparedTo(originalQuestion)
      : true;

    if (shouldUpdateUrl) {
      const isAdHocModel =
        question.type() === "model" &&
        isAdHocModelQuestion(question, originalQuestion);

      dispatch(updateUrl(question, { dirty: !isAdHocModel && isCardDirty }));
    }

    const startTime = new Date();
    const cancelQueryDeferred = defer();

    const queryTimer = startTimer();

    apiRunQuestionQuery(question, {
      cancelDeferred: cancelQueryDeferred,
      ignoreCache: ignoreCache,
      isDirty: isQueryDirty,
    })
      .then(queryResults => {
        queryTimer(duration =>
          MetabaseAnalytics.trackStructEvent(
            "QueryBuilder",
            "Run Query",
            question.datasetQuery().type,
            duration,
          ),
        );
        return dispatch(queryCompleted(question, queryResults));
      })
      .catch(error => dispatch(queryErrored(startTime, error)));

    dispatch({ type: RUN_QUERY, payload: { cancelQueryDeferred } });
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

export const CLEAR_QUERY_RESULT = "metabase/query_builder/CLEAR_QUERY_RESULT";
export const clearQueryResult = createAction(CLEAR_QUERY_RESULT);

export const QUERY_COMPLETED = "metabase/qb/QUERY_COMPLETED";
export const queryCompleted = (question, queryResults) => {
  return async (dispatch, getState) => {
    const [{ data, error }] = queryResults;
    const prevCard = getCard(getState());
    const { data: prevData, error: prevError } =
      getFirstQueryResult(getState()) ?? {};

    const originalQuestion = getOriginalQuestionWithParameterValues(getState());
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    const isDirty = isEditable && question.isDirtyComparedTo(originalQuestion);

    if (isDirty) {
      const series = [{ card: question.card(), data, error }];
      const previousSeries =
        prevCard && (prevData || prevError)
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
      type: QUERY_COMPLETED,
      payload: {
        card,
        queryResults,
      },
    });
    dispatch(loadCompleteUIControls());
  };
};

export const QUERY_ERRORED = "metabase/qb/QUERY_ERRORED";
export const queryErrored = createThunkAction(
  QUERY_ERRORED,
  (startTime, error) => {
    return async () => {
      if (error && error.isCancelled) {
        return null;
      } else {
        return { error: error, duration: new Date() - startTime };
      }
    };
  },
);

export const CANCEL_QUERY = "metabase/qb/CANCEL_QUERY";
export const cancelQuery = () => (dispatch, getState) => {
  const isRunning = getIsRunning(getState());
  if (isRunning) {
    const { cancelQueryDeferred } = getState().qb;
    if (cancelQueryDeferred) {
      cancelQueryDeferred.resolve();
    }
    dispatch(setDocumentTitle(""));

    return { type: CANCEL_QUERY };
  }
};
