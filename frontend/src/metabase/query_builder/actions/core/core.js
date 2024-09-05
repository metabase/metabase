import { createAction } from "redux-actions";
import _ from "underscore";

import { fetchAlertsForQuestion } from "metabase/alert/alert";
import Databases from "metabase/entities/databases";
import { updateModelIndexes } from "metabase/entities/model-indexes/actions";
import Questions from "metabase/entities/questions";
import Revision from "metabase/entities/revisions";
import { loadCard } from "metabase/lib/card";
import { shouldOpenInBlankWindow } from "metabase/lib/dom";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { copy } from "metabase/lib/utils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { openUrl } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isAdHocModelOrMetricQuestion } from "metabase-lib/v1/metadata/utils/models";
import Query from "metabase-lib/v1/queries/Query";
import {
  cardIsEquivalent,
  cardQueryIsEquivalent,
} from "metabase-lib/v1/queries/utils/card";

import { trackNewQuestionSaved } from "../../analytics";
import {
  getCard,
  getIsResultDirty,
  getOriginalQuestion,
  getParameters,
  getQuestion,
  getSubmittableQuestion,
  isBasedOnExistingQuestion,
} from "../../selectors";
import { updateUrl } from "../navigation";
import { zoomInRow } from "../object-detail";
import { clearQueryResult, runQuestionQuery } from "../querying";
import { onCloseSidebars } from "../ui";

import { API_UPDATE_QUESTION, SOFT_RELOAD_CARD } from "./types";
import { updateQuestion } from "./updateQuestion";

export const RESET_QB = "metabase/qb/RESET_QB";
export const resetQB = createAction(RESET_QB);

// refreshes the card without triggering a run of the card's query
export { SOFT_RELOAD_CARD };
export const softReloadCard = createThunkAction(SOFT_RELOAD_CARD, () => {
  return async (dispatch, getState) => {
    const outdatedCard = getCard(getState());
    const action = await dispatch(
      Questions.actions.fetch({ id: outdatedCard.id }, { reload: true }),
    );

    return Questions.HACK_getObjectFromAction(action);
  };
});

export const RELOAD_CARD = "metabase/qb/RELOAD_CARD";
export const reloadCard = createThunkAction(RELOAD_CARD, () => {
  return async (dispatch, getState) => {
    const outdatedQuestion = getQuestion(getState());

    dispatch(resetQB());

    const action = await dispatch(
      Questions.actions.fetch({ id: outdatedQuestion.id() }, { reload: true }),
    );
    const card = Questions.HACK_getObjectFromAction(action);

    // We need to manually massage the paramters into the parameterValues shape,
    // to be able to pass them to new Question.
    // We could use _parameterValues here but prefer not to use internal fields.
    const parameterValues = outdatedQuestion.parameters().reduce(
      (acc, next) => ({
        ...acc,
        [next.id]: next.value,
      }),
      {},
    );

    const question = new Question(
      card,
      getMetadata(getState()),
      parameterValues,
    );

    dispatch(loadMetadataForCard(card));

    dispatch(
      runQuestionQuery({
        overrideWithQuestion: question,
        shouldUpdateUrl: false,
      }),
    );

    // if the name of the card changed this will update the url slug
    dispatch(updateUrl(new Question(card), { dirty: false }));

    return card;
  };
});

/**
 * `setCardAndRun` is used when:
 *     - navigating browser history
 *     - clicking in the entity details view
 *     - `navigateToNewCardInsideQB` is being called (see below)
 */
export const SET_CARD_AND_RUN = "metabase/qb/SET_CARD_AND_RUN";
export const setCardAndRun = (nextCard, { shouldUpdateUrl = true } = {}) => {
  return async (dispatch, getState) => {
    // clone
    const card = copy(nextCard);

    const originalCard = card.original_card_id
      ? // If the original card id is present, dynamically load its information for showing lineage
        await loadCard(card.original_card_id, { dispatch, getState })
      : // Otherwise, use a current card as the original card if the card has been saved
        // This is needed for checking whether the card is in dirty state or not
        card.id
        ? card
        : null;

    // Update the card and originalCard before running the actual query
    dispatch({ type: SET_CARD_AND_RUN, payload: { card, originalCard } });
    dispatch(runQuestionQuery({ shouldUpdateUrl }));

    // Load table & database metadata for the current question
    dispatch(loadMetadataForCard(card));
  };
};

/**
 * User-triggered events that are handled with this action:
 *     - clicking a legend:
 *         * series legend (multi-aggregation, multi-breakout, multiple questions)
 *     - clicking the visualization itself
 *         * drill-through (single series, multi-aggregation, multi-breakout, multiple questions)
 *     - clicking an action widget action
 *
 * All these events can be applied either for an unsaved question or a saved question.
 */
export const NAVIGATE_TO_NEW_CARD = "metabase/qb/NAVIGATE_TO_NEW_CARD";
export const navigateToNewCardInsideQB = createThunkAction(
  NAVIGATE_TO_NEW_CARD,
  ({ nextCard, previousCard, objectId }) => {
    return async (dispatch, getState) => {
      if (previousCard === nextCard) {
        // Do not reload questions with breakouts when clicked on a legend item
      } else if (cardIsEquivalent(previousCard, nextCard)) {
        // This is mainly a fallback for scenarios where a visualization legend is clicked inside QB
        dispatch(
          setCardAndRun(
            await loadCard(nextCard.id, { dispatch, getState }),
            {},
          ),
        );
      } else {
        const card = getCardAfterVisualizationClick(nextCard, previousCard);
        const url = Urls.serializedQuestion(card);
        if (shouldOpenInBlankWindow(url, { blankOnMetaOrCtrlKey: true })) {
          dispatch(openUrl(url));
        } else {
          dispatch(onCloseSidebars());
          if (!cardQueryIsEquivalent(previousCard, nextCard)) {
            // clear the query result so we don't try to display the new visualization before running the new query
            dispatch(clearQueryResult());
          }
          // When the dataset query changes, we should change the type,
          // to start building a new ad-hoc question based on a dataset
          dispatch(setCardAndRun({ ...card, type: "question" }));
        }
        if (objectId !== undefined) {
          dispatch(zoomInRow({ objectId }));
        }
      }
    };
  },
);

// DEPRECATED, still used in a couple places
export const setDatasetQuery =
  (datasetQuery, options) => (dispatch, getState) => {
    if (datasetQuery instanceof Query) {
      datasetQuery = datasetQuery.datasetQuery();
    }

    const question = getQuestion(getState());
    dispatch(updateQuestion(question.setDatasetQuery(datasetQuery), options));
  };

export const API_CREATE_QUESTION = "metabase/qb/API_CREATE_QUESTION";
export const apiCreateQuestion = question => {
  return async (dispatch, getState) => {
    const submittableQuestion = getSubmittableQuestion(getState(), question);
    const createdQuestion = await reduxCreateQuestion(
      submittableQuestion,
      dispatch,
    );

    const databases = Databases.selectors.getList(getState());
    if (databases && !databases.some(d => d.is_saved_questions)) {
      dispatch({ type: Databases.actionTypes.INVALIDATE_LISTS_ACTION });
    }

    trackNewQuestionSaved(
      question,
      createdQuestion,
      isBasedOnExistingQuestion(getState()),
    );

    // Saving a card, locks in the current display as though it had been
    // selected in the UI.
    const card = createdQuestion.lockDisplay().card();
    dispatch({ type: API_CREATE_QUESTION, payload: card });

    await dispatch(loadMetadataForCard(card));

    const isModel = question.type() === "model";
    const isMetric = question.type() === "metric";
    if (isModel || isMetric) {
      dispatch(runQuestionQuery());
    }
  };
};

export { API_UPDATE_QUESTION };
export const apiUpdateQuestion = (question, { rerunQuery } = {}) => {
  return async (dispatch, getState) => {
    const originalQuestion = getOriginalQuestion(getState());
    question = question || getQuestion(getState());

    const isResultDirty = getIsResultDirty(getState());
    const isModel = question.type() === "model";

    const { isNative } = Lib.queryDisplayInfo(question.query());

    if (!isNative) {
      rerunQuery = rerunQuery ?? isResultDirty;
    }

    const submittableQuestion = getSubmittableQuestion(getState(), question);

    // When viewing a dataset, its dataset_query is swapped with a clean query using the dataset as a source table
    // (it's necessary for datasets to behave like tables opened in simple mode)
    // When doing updates like changing name, description, etc., we need to omit the dataset_query in the request body
    const updatedQuestion = await reduxUpdateQuestion(
      submittableQuestion,
      dispatch,
      {
        excludeDatasetQuery: isAdHocModelOrMetricQuestion(
          question,
          originalQuestion,
        ),
      },
    );

    // reload the question alerts for the current question
    // (some of the old alerts might be removed during update)
    await dispatch(fetchAlertsForQuestion(updatedQuestion.id()));

    await dispatch({
      type: API_UPDATE_QUESTION,
      payload: updatedQuestion.card(),
    });

    if (isModel) {
      // this needs to happen after the question update completes in case we have changed the type
      // of the primary key field in the same update
      await dispatch(updateModelIndexes(question));
    }

    await dispatch(loadMetadataForCard(question.card()));

    if (rerunQuery) {
      dispatch(runQuestionQuery());
    }
  };
};

export const SET_PARAMETER_VALUE = "metabase/qb/SET_PARAMETER_VALUE";
export const setParameterValue = createAction(
  SET_PARAMETER_VALUE,
  (parameterId, value) => {
    return { id: parameterId, value: normalizeValue(value) };
  },
);

export const SET_PARAMETER_VALUE_TO_DEFAULT =
  "metabase/qb/SET_PARAMETER_VALUE_TO_DEFAULT";
export const setParameterValueToDefault = createThunkAction(
  SET_PARAMETER_VALUE_TO_DEFAULT,
  parameterId => (dispatch, getState) => {
    const parameter = getParameters(getState()).find(
      ({ id }) => id === parameterId,
    );
    const defaultValue = parameter?.default;

    if (defaultValue) {
      dispatch(setParameterValue(parameterId, defaultValue));
    }
  },
);

function normalizeValue(value) {
  if (value === "") {
    return null;
  }

  if (Array.isArray(value) && value.length === 0) {
    return null;
  }

  return value;
}

export const REVERT_TO_REVISION = "metabase/qb/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  revision => {
    return async dispatch => {
      await dispatch(Revision.objectActions.revert(revision));
      await dispatch(reloadCard());
    };
  },
);

async function reduxCreateQuestion(question, dispatch) {
  const card = question.card();
  const result = Questions.actions.create(card);
  const action = await dispatch(result);
  const object = Questions.HACK_getObjectFromAction(action);
  const newQuesiton = question.setCard(object);
  return newQuesiton;
}

async function reduxUpdateQuestion(
  question,
  dispatch,
  { excludeDatasetQuery = false },
) {
  const fullCard = question.card();
  const card = excludeDatasetQuery
    ? _.omit(fullCard, "dataset_query")
    : fullCard;
  const action = await dispatch(
    Questions.actions.update({ id: question.id() }, card),
  );
  return question.setCard(Questions.HACK_getObjectFromAction(action));
}
