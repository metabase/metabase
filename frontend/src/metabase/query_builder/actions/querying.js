import _ from "underscore";
import { assocIn } from "icepick";
import { t } from "ttag";

import { createAction } from "redux-actions";

import { PLUGIN_SELECTORS } from "metabase/plugins";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { isAdHocModelQuestion } from "metabase/lib/data-modeling/utils";
import { startTimer } from "metabase/lib/performance";
import { defer } from "metabase/lib/promise";
import { createThunkAction } from "metabase/lib/redux";

import { getMetadata } from "metabase/selectors/metadata";
import { getSensibleDisplays } from "metabase/visualizations";

import Question from "metabase-lib/lib/Question";

import {
  getIsPreviewing,
  getIsRunning,
  getOriginalQuestion,
  getQueryBuilderMode,
  getQueryResults,
  getQuestion,
  getTimeoutId,
} from "../selectors";

import { updateUrl } from "./navigation";

const PREVIEW_RESULT_LIMIT = 10;

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

/**
 * Queries the result for the currently active question or alternatively for the card provided in `overrideWithCard`.
 * The API queries triggered by this action creator can be cancelled using the deferred provided in RUN_QUERY action.
 */
export const RUN_QUERY = "metabase/qb/RUN_QUERY";
export const runQuestionQuery = ({
  shouldUpdateUrl = true,
  ignoreCache = false,
  overrideWithCard = null,
} = {}) => {
  return async (dispatch, getState) => {
    dispatch(loadStartUIControls());
    const questionFromCard = card =>
      card && new Question(card, getMetadata(getState()));

    let question = overrideWithCard
      ? questionFromCard(overrideWithCard)
      : getQuestion(getState());
    const originalQuestion = getOriginalQuestion(getState());

    const cardIsDirty = originalQuestion
      ? question.isDirtyComparedToWithoutParameters(originalQuestion) ||
        question.card().id == null
      : true;

    if (shouldUpdateUrl) {
      const isAdHocModel =
        question.isDataset() &&
        isAdHocModelQuestion(question, originalQuestion);

      dispatch(
        updateUrl(question.card(), { dirty: !isAdHocModel && cardIsDirty }),
      );
    }

    if (getIsPreviewing(getState())) {
      question = question.setDatasetQuery(
        assocIn(
          question.datasetQuery(),
          ["constraints", "max-results"],
          PREVIEW_RESULT_LIMIT,
        ),
      );
    }

    const startTime = new Date();
    const cancelQueryDeferred = defer();

    const queryTimer = startTimer();

    question
      .apiGetResults({
        cancelDeferred: cancelQueryDeferred,
        ignoreCache: ignoreCache,
        isDirty: cardIsDirty,
      })
      .then(queryResults => {
        queryTimer(duration =>
          MetabaseAnalytics.trackStructEvent(
            "QueryBuilder",
            "Run Query",
            question.query().datasetQuery().type,
            duration,
          ),
        );
        // clearTimeout(timeoutId);
        return dispatch(queryCompleted(question, queryResults));
      })
      .catch(error => dispatch(queryErrored(startTime, error)));

    dispatch.action(RUN_QUERY, { cancelQueryDeferred });
  };
};

const loadStartUIControls = createThunkAction(
  LOAD_START_UI_CONTROLS,
  () => (dispatch, getState) => {
    const loadingMessage = PLUGIN_SELECTORS.getLoadingMessage(getState());
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
    const [{ data }] = queryResults;
    const [{ data: prevData }] = getQueryResults(getState()) || [{}];
    const originalQuestion = getOriginalQuestion(getState());
    const isDirty =
      question.query().isEditable() &&
      question.isDirtyComparedTo(originalQuestion);

    if (isDirty) {
      if (question.isNative()) {
        question = question.syncColumnsAndSettings(
          originalQuestion,
          queryResults[0],
        );
      }
      // Only update the display if the question is new or has been changed.
      // Otherwise, trust that the question was saved with the correct display.
      question = question
        // if we are going to trigger autoselection logic, check if the locked display no longer is "sensible".
        .maybeUnlockDisplay(
          getSensibleDisplays(data),
          prevData && getSensibleDisplays(prevData),
        )
        .setDefaultDisplay()
        .switchTableScalar(data);
    }

    const card = question.card();
    const isEditingModel = getQueryBuilderMode(getState()) === "dataset";
    const resultsMetadata = data?.results_metadata?.columns;
    if (isEditingModel && Array.isArray(resultsMetadata)) {
      card.result_metadata = resultsMetadata;
    }

    dispatch.action(QUERY_COMPLETED, { card, queryResults });
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
