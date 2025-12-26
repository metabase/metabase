import { createAction } from "redux-actions";
import { t } from "ttag";
import _ from "underscore";

import { invalidateNotificationsApiCache, revisionApi } from "metabase/api";
import { Databases } from "metabase/entities/databases";
import { updateModelIndexes } from "metabase/entities/model-indexes/actions";
import { Questions } from "metabase/entities/questions";
import { shouldOpenInBlankWindow } from "metabase/lib/dom";
import { entityCompatibleQuery } from "metabase/lib/entities";
import { createThunkAction } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { copy } from "metabase/lib/utils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { openUrl } from "metabase/redux/app";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isAdHocModelOrMetricQuestion } from "metabase-lib/v1/metadata/utils/models";
import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import {
  cardIsEquivalent,
  cardQueryIsEquivalent,
} from "metabase-lib/v1/queries/utils/card";
import type {
  Card,
  DashboardTabId,
  Database,
  DatasetQuery,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import { trackNewQuestionSaved } from "../../analytics";
import {
  getCard,
  getIsResultDirty,
  getIsShowingRawTable,
  getOriginalQuestion,
  getParameters,
  getQuestion,
  getSubmittableQuestion,
  isBasedOnExistingQuestion,
} from "../../selectors";
import {
  clearQueryResult,
  runDirtyQuestionQuery,
  runQuestionQuery,
} from "../querying";
import { onCloseSidebars } from "../ui";
import { updateUrl } from "../url";
import { zoomInRow } from "../zoom";

import { loadCard } from "./card";
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

    if (!outdatedQuestion) {
      return;
    }

    const action = await dispatch(
      Questions.actions.fetch({ id: outdatedQuestion.id() }, { reload: true }),
    );
    const card = Questions.HACK_getObjectFromAction(action);

    dispatch(loadMetadataForCard(card));

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
export const setCardAndRun = (
  nextCard: Card,
  { shouldUpdateUrl = true } = {},
) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    // clone
    const card = copy(nextCard);

    const originalCard = card.original_card_id
      ? // If the original card id is present, dynamically load its information for showing lineage
        await loadCard(
          { cardId: card.original_card_id },
          { dispatch, getState },
        )
      : // Otherwise, use a current card as the original card if the card has been saved
        // This is needed for checking whether the card is in dirty state or not
        card.id
        ? card
        : null;

    // Update the card and originalCard before running the actual query
    dispatch({ type: SET_CARD_AND_RUN, payload: { card, originalCard } });
    dispatch(runDirtyQuestionQuery({ shouldUpdateUrl }));

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
            await loadCard({ cardId: nextCard.id }, { dispatch, getState }),
            {},
          ),
        );
      } else {
        // when navigating in the "raw" table mode, preserve the original viz settings
        const isRawTable = getIsShowingRawTable(getState());
        const currentCard = getCard(getState());
        const adjustedNextCard =
          isRawTable && currentCard != null
            ? {
                ...nextCard,
                display: currentCard.display,
                visualization_settings: currentCard.visualization_settings,
              }
            : nextCard;
        const cardAfterClick = getCardAfterVisualizationClick(
          adjustedNextCard,
          previousCard,
        );
        const url = Urls.serializedQuestion(cardAfterClick);
        if (shouldOpenInBlankWindow(url, { blankOnMetaOrCtrlKey: true })) {
          dispatch(openUrl(url));
        } else {
          dispatch(onCloseSidebars());
          if (!cardQueryIsEquivalent(previousCard, adjustedNextCard)) {
            // clear the query result so we don't try to display the new visualization before running the new query
            dispatch(clearQueryResult());
          }
          // When the dataset query changes, we should change the type,
          // to start building a new ad-hoc question based on a dataset
          dispatch(setCardAndRun({ ...cardAfterClick, type: "question" }));
        }

        if (objectId !== undefined) {
          // TODO: this should happen after we navigated to a new card, but in reality we open details view before navigation, which adds one more item in browser history
          setTimeout(() => {
            dispatch(zoomInRow({ objectId }));
          });
        }
      }
    };
  },
);

// DEPRECATED, still used in a couple places
export const setDatasetQuery =
  (datasetQuery: DatasetQuery) => (dispatch: Dispatch, getState: GetState) => {
    if (datasetQuery instanceof NativeQuery) {
      datasetQuery = datasetQuery.datasetQuery();
    }

    const question = getQuestion(getState());

    if (!question) {
      return;
    }

    dispatch(updateQuestion(question.setDatasetQuery(datasetQuery)));
  };

type OnCreateOptions = { dashboardTabId?: DashboardTabId | undefined };

export const API_CREATE_QUESTION = "metabase/qb/API_CREATE_QUESTION";
export const apiCreateQuestion = (
  question: Question,
  options?: OnCreateOptions,
) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    let submittableQuestion = getSubmittableQuestion(getState(), question);
    // Saving models with list view setting as a question in not allowed for now,
    // so we change it back to table.
    if (
      question.type() === "question" &&
      submittableQuestion.display() === "list"
    ) {
      submittableQuestion = submittableQuestion.setDisplay("table");
    }
    const createdQuestion = await reduxCreateQuestion(
      submittableQuestion,
      dispatch,
      options,
    );

    const databases: Database[] = Databases.selectors.getList(getState());
    if (databases && !databases.some((d) => d.is_saved_questions)) {
      dispatch({ type: Databases.actionTypes.INVALIDATE_LISTS_ACTION });
    }

    trackNewQuestionSaved(
      question,
      createdQuestion,
      isBasedOnExistingQuestion(getState()),
    );

    // Saving a card, locks in the current display as though it had been
    // selected in the UI.
    const createdCard = createdQuestion.lockDisplay().card();
    dispatch({ type: API_CREATE_QUESTION, payload: createdCard });

    await dispatch(loadMetadataForCard(createdCard));
    const createdQuestionWithMetadata = new Question(
      createdCard,
      getMetadata(getState()),
    );

    const isModel = question.type() === "model";
    const isMetric = question.type() === "metric";
    if (isModel || isMetric) {
      // composeQuestionAdhoc() returns a question with a 'table' display by default
      const composedQuestion =
        isModel && question.display() === "list"
          ? createdQuestionWithMetadata.composeQuestionAdhoc({
              display: "list",
            })
          : createdQuestionWithMetadata.composeQuestionAdhoc();
      dispatch(runQuestionQuery({ overrideWithQuestion: composedQuestion }));
    }

    return createdQuestionWithMetadata;
  };
};

export { API_UPDATE_QUESTION };
export const apiUpdateQuestion = (
  question: Question,
  { rerunQuery }: { rerunQuery?: boolean } = {},
) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    const originalQuestion = getOriginalQuestion(getState());
    question = question || getQuestion(getState());

    const isResultDirty = getIsResultDirty(getState());
    const isModel = question.type() === "model";
    const isMetric = question.type() === "metric";

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
        excludeVisualisationSettings: isMetric,
      },
    );

    // invalidate question notifications
    // (some of the old alerts might be removed during update)
    dispatch(invalidateNotificationsApiCache());

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
  (parameterId: ParameterId, value: ParameterValueOrArray | null) => {
    return { id: parameterId, value: normalizeValue(value) };
  },
);

export const SET_PARAMETER_VALUE_TO_DEFAULT =
  "metabase/qb/SET_PARAMETER_VALUE_TO_DEFAULT";
export const setParameterValueToDefault = createThunkAction(
  SET_PARAMETER_VALUE_TO_DEFAULT,
  (parameterId) => (dispatch, getState) => {
    const parameter = getParameters(getState()).find(
      ({ id }) => id === parameterId,
    );
    const defaultValue = parameter?.default;

    if (defaultValue) {
      dispatch(setParameterValue(parameterId, defaultValue));
    }
  },
);

function normalizeValue(
  value: ParameterValueOrArray | null,
): ParameterValueOrArray | null {
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
  (cardId, revision) => {
    return async (dispatch) => {
      try {
        await entityCompatibleQuery(
          {
            id: cardId,
            entity: "card",
            revision_id: revision.id,
          },
          dispatch,
          revisionApi.endpoints.revertRevision,
        );
        await dispatch(reloadCard());
        await dispatch(runQuestionQuery({ shouldUpdateUrl: false }));
        return { id: cardId };
      } catch (error) {
        console.error("Error reverting question to revision:", error);
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message:
              error?.data?.message ||
              error?.message ||
              t`Failed to revert to this version`,
          }),
        );
        throw error;
      }
    };
  },
);

async function reduxCreateQuestion(
  question: Question,
  dispatch: Dispatch,
  options?: OnCreateOptions,
) {
  const action = await dispatch(
    Questions.actions.create({
      ...question.card(),
      dashboard_tab_id: options?.dashboardTabId,
    }),
  );
  return question.setCard(Questions.HACK_getObjectFromAction(action));
}

async function reduxUpdateQuestion(
  question: Question,
  dispatch: Dispatch,
  { excludeDatasetQuery = false, excludeVisualisationSettings = false },
) {
  const fullCard = question.card();

  const keysToOmit = [
    excludeDatasetQuery ? "dataset_query" : null,
    excludeVisualisationSettings ? "visualization_settings" : null,
  ].filter(isNotNull);

  const card = _.omit(fullCard, ...keysToOmit);

  const action = await dispatch(
    Questions.actions.update({ id: question.id() }, card),
  );
  return question.setCard(Questions.HACK_getObjectFromAction(action));
}
