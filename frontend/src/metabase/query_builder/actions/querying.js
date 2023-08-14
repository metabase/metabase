import { t } from "ttag";
import { createAction } from "redux-actions";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { startTimer } from "metabase/lib/performance";
import { defer } from "metabase/lib/promise";
import { createThunkAction } from "metabase/lib/redux";
import { runQuestionQuery as apiRunQuestionQuery } from "metabase/services";
import { getVisualization } from "metabase/visualizations";

import { getMetadata } from "metabase/selectors/metadata";
import { getWhiteLabeledLoadingMessage } from "metabase/selectors/whitelabel";
import { isSameField } from "metabase-lib/queries/utils/field-ref";

import Question from "metabase-lib/Question";

import { isAdHocModelQuestion } from "metabase-lib/metadata/utils/models";
import {
  getIsRunning,
  getOriginalQuestion,
  getQueryBuilderMode,
  getQueryResults,
  getQuestion,
  getTimeoutId,
  getIsResultDirty,
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

    const question = overrideWithCard
      ? questionFromCard(overrideWithCard)
      : getQuestion(getState());
    const originalQuestion = getOriginalQuestion(getState());

    const cardIsDirty = originalQuestion
      ? question.isDirtyComparedToWithoutParameters(originalQuestion) ||
        question.id() == null
      : true;

    if (shouldUpdateUrl) {
      const isAdHocModel =
        question.isDataset() &&
        isAdHocModelQuestion(question, originalQuestion);

      dispatch(updateUrl(question, { dirty: !isAdHocModel && cardIsDirty }));
    }

    const startTime = new Date();
    const cancelQueryDeferred = defer();

    const queryTimer = startTimer();

    apiRunQuestionQuery(question, {
      cancelDeferred: cancelQueryDeferred,
      ignoreCache: ignoreCache,
      isDirty: cardIsDirty,
    })
      .then(queryResults => {
        queryTimer(duration =>
          MetabaseAnalytics.trackStructEvent(
            "QueryBuilder",
            "Run Query",
            question.type(),
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
    const loadingMessage = getWhiteLabeledLoadingMessage(getState());
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

export const maybeResetDisplay = (
  question,
  originalQuestion,
  data,
  prevData,
) => {
  const isScalarDisplay = ["scalar", "progress", "gauge"].includes(
    question.display(),
  );
  const isScalarResult = data.rows.length === 1 && data.cols.length === 1;
  const wasScalarResult =
    prevData && prevData.rows.length === 1 && prevData.cols.length === 1;
  if (isScalarDisplay && wasScalarResult && !isScalarResult) {
    // if there is a scalar display with a non-scalar result, switch the display to table
    // unless it was already like that
    return question.setDisplay("table");
  }
  if (!question.isDirtyComparedToWithoutParameters(originalQuestion)) {
    // if only the parameters changed, skip everything else
    return question;
  }
  const viz = getVisualization(question.display());
  const wasSensible = prevData && viz.isSensible(prevData);
  const isSensible = viz.isSensible(data);
  if ((wasSensible && !isSensible) || !prevData) {
    // if the display was sensible and now it's not, or there was no data to begin with,
    // the display should be unlocked
    question = question.setDisplayIsLocked(false);
  }
  if (
    !isScalarDisplay &&
    !wasScalarResult &&
    isScalarResult &&
    !question.displayIsLocked()
  ) {
    // if we have a 1x1 result, and previously we didn't, and display is unlocked, switch display to scalar
    return question.setDisplay("scalar");
  }
  const defaultDisplay = question.setDefaultDisplay().display();
  if (isSensible && defaultDisplay === "table") {
    // if the display is already sensible, don't switch to a table.
    // any sensible display is better than the default table display
    return question;
  }
  // otherwise switch to the default display.
  // it still needs to be unlocked to actually switch.
  return question.setDefaultDisplay();
};

export const QUERY_COMPLETED = "metabase/qb/QUERY_COMPLETED";
export const queryCompleted = (question, queryResults) => {
  return async (dispatch, getState) => {
    const [{ data }] = queryResults;
    const [{ data: prevData }] = getQueryResults(getState()) || [{}];
    const originalQuestion = getOriginalQuestion(getState());

    if (question.query().isEditable()) {
      if (question.isNative()) {
        question = question.syncColumnsAndSettings(
          originalQuestion,
          queryResults[0],
        );
      }
      question = maybeResetDisplay(question, originalQuestion, data, prevData);
    }

    const card = question.card();

    const isEditingModel = getQueryBuilderMode(getState()) === "dataset";
    const isEditingSavedModel = isEditingModel && !!originalQuestion;
    const modelMetadata = isEditingSavedModel
      ? preserveModelMetadata(queryResults, originalQuestion)
      : undefined;

    dispatch({
      type: QUERY_COMPLETED,
      payload: {
        card,
        queryResults,
        modelMetadata,
      },
    });
    dispatch(loadCompleteUIControls());
  };
};

function preserveModelMetadata(queryResults, originalModel) {
  const [{ data }] = queryResults;
  const queryMetadata = data?.results_metadata?.columns || [];
  const modelMetadata = originalModel.getResultMetadata();

  const mergedMetadata = mergeQueryMetadataWithModelMetadata(
    queryMetadata,
    modelMetadata,
  );

  return {
    columns: mergedMetadata,
  };
}

function mergeQueryMetadataWithModelMetadata(queryMetadata, modelMetadata) {
  return queryMetadata.map((queryCol, index) => {
    const modelCol = modelMetadata.find(modelCol => {
      return isSameField(modelCol.field_ref, queryCol.field_ref);
    });

    if (modelCol) {
      return modelCol;
    }

    return queryCol;
  });
}

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
