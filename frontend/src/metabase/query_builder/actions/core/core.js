import _ from "underscore";
import { assocIn } from "icepick";
import { createAction } from "redux-actions";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { loadCard } from "metabase/lib/card";
import { isAdHocModelQuestion } from "metabase/lib/data-modeling/utils";
import { shouldOpenInBlankWindow } from "metabase/lib/dom";
import * as Urls from "metabase/lib/urls";
import Utils from "metabase/lib/utils";
import { createThunkAction } from "metabase/lib/redux";

import { cardIsEquivalent, cardQueryIsEquivalent } from "metabase/meta/Card";

import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import { getPersistableDefaultSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import { openUrl } from "metabase/redux/app";
import { setRequestUnloaded } from "metabase/redux/requests";
import { loadMetadataForQueries } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import Questions from "metabase/entities/questions";
import { fetchAlertsForQuestion } from "metabase/alert/alert";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import {
  getTemplateTagsForParameters,
  getTemplateTagParameters,
} from "metabase/parameters/utils/cards";

import { trackNewQuestionSaved } from "../../analytics";
import {
  getCard,
  getFirstQueryResult,
  getIsEditing,
  getIsShowingTemplateTagsEditor,
  getOriginalQuestion,
  getQueryBuilderMode,
  getQuestion,
  getRawSeries,
  getResultsMetadata,
  getTransformedSeries,
  isBasedOnExistingQuestion,
} from "../../selectors";
import { getNextTemplateTagVisibilityState } from "../../utils";

import { updateUrl } from "../navigation";
import { setIsShowingTemplateTagsEditor } from "../native";
import { zoomInRow } from "../object-detail";
import { clearQueryResult, runQuestionQuery } from "../querying";
import { onCloseSidebars, setQueryBuilderMode } from "../ui";

export const RESET_QB = "metabase/qb/RESET_QB";
export const resetQB = createAction(RESET_QB);

/**
 * Saves to `visualization_settings` property of a question those visualization settings that
 * 1) don't have a value yet and 2) have `persistDefault` flag enabled.
 *
 * Needed for persisting visualization columns for pulses/alerts, see #6749.
 */
const getQuestionWithDefaultVisualizationSettings = (question, series) => {
  const oldVizSettings = question.settings();
  const newVizSettings = {
    ...oldVizSettings,
    ...getPersistableDefaultSettingsForSeries(series),
  };

  // Don't update the question unnecessarily
  // (even if fields values haven't changed, updating the settings will make the question appear dirty)
  if (!_.isEqual(oldVizSettings, newVizSettings)) {
    return question.setSettings(newVizSettings);
  } else {
    return question;
  }
};

function hasNewColumns(question, queryResult) {
  // NOTE: this assume column names will change
  // technically this is wrong because you could add and remove two columns with the same name
  const query = question.query();
  const previousColumns =
    (queryResult && queryResult.data.cols.map(col => col.name)) || [];
  const nextColumns =
    query instanceof StructuredQuery ? query.columnNames() : [];
  return _.difference(nextColumns, previousColumns).length > 0;
}

export const loadMetadataForCard = (card, options) => (dispatch, getState) => {
  const metadata = getMetadata(getState());
  const question = new Question(card, metadata);
  const queries = [question.query()];
  if (question.isDataset()) {
    queries.push(question.composeDataset().query());
  }
  return dispatch(
    loadMetadataForQueries(queries, question.dependentMetadata(), options),
  );
};

// refreshes the card without triggering a run of the card's query
export const SOFT_RELOAD_CARD = "metabase/qb/SOFT_RELOAD_CARD";
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
    const outdatedCard = getCard(getState());

    dispatch(resetQB());

    const action = await dispatch(
      Questions.actions.fetch({ id: outdatedCard.id }, { reload: true }),
    );
    const card = Questions.HACK_getObjectFromAction(action);

    dispatch(loadMetadataForCard(card));

    dispatch(
      runQuestionQuery({
        overrideWithCard: card,
        shouldUpdateUrl: false,
      }),
    );

    // if the name of the card changed this will update the url slug
    dispatch(updateUrl(card, { dirty: false }));

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
export const setCardAndRun = (nextCard, shouldUpdateUrl = true) => {
  return async (dispatch, getState) => {
    // clone
    const card = Utils.copy(nextCard);

    const originalCard = card.original_card_id
      ? // If the original card id is present, dynamically load its information for showing lineage
        await loadCard(card.original_card_id)
      : // Otherwise, use a current card as the original card if the card has been saved
      // This is needed for checking whether the card is in dirty state or not
      card.id
      ? card
      : null;

    // Update the card and originalCard before running the actual query
    dispatch.action(SET_CARD_AND_RUN, { card, originalCard });
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
        dispatch(setCardAndRun(await loadCard(nextCard.id)));
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
          // When the dataset query changes, we should loose the dataset flag,
          // to start building a new ad-hoc question based on a dataset
          dispatch(setCardAndRun({ ...card, dataset: false }));
        }
        if (objectId !== undefined) {
          dispatch(zoomInRow({ objectId }));
        }
      }
    };
  },
);

/**
 * Replaces the currently active question with the given Question object.
 * Also shows/hides the template tag editor if the number of template tags has changed.
 */
export const UPDATE_QUESTION = "metabase/qb/UPDATE_QUESTION";
export const updateQuestion = (
  newQuestion,
  {
    shouldStartAdHocQuestion = true,
    run = false,
    shouldUpdateUrl = false,
  } = {},
) => {
  return async (dispatch, getState) => {
    const oldQuestion = getQuestion(getState());
    const mode = getQueryBuilderMode(getState());

    // TODO Atte Keinänen 6/2/2017 Ways to have this happen automatically when modifying a question?
    // Maybe the Question class or a QB-specific question wrapper class should know whether it's being edited or not?
    if (
      shouldStartAdHocQuestion &&
      newQuestion.query().isEditable() &&
      !getIsEditing(getState()) &&
      newQuestion.isSaved() &&
      mode !== "dataset"
    ) {
      newQuestion = newQuestion.withoutNameAndId();

      // When the dataset query changes, we should loose the dataset flag,
      // to start building a new ad-hoc question based on a dataset
      if (newQuestion.isDataset()) {
        newQuestion = newQuestion.setDataset(false);
      }
    }

    const queryResult = getFirstQueryResult(getState());
    newQuestion = newQuestion.syncColumnsAndSettings(oldQuestion, queryResult);

    if (run === "auto") {
      run = hasNewColumns(newQuestion, queryResult);
    }

    if (!newQuestion.canAutoRun()) {
      run = false;
    }

    // <PIVOT LOGIC>
    // We have special logic when going to, coming from, or updating a pivot table.
    const isPivot = newQuestion.display() === "pivot";
    const wasPivot = oldQuestion.display() === "pivot";
    const queryHasBreakouts =
      isPivot &&
      newQuestion.isStructured() &&
      newQuestion.query().breakouts().length > 0;

    // we can only pivot queries with breakouts
    if (isPivot && queryHasBreakouts) {
      // compute the pivot setting now so we can query the appropriate data
      const series = assocIn(
        getRawSeries(getState()),
        [0, "card"],
        newQuestion.card(),
      );
      const key = "pivot_table.column_split";
      const setting = getQuestionWithDefaultVisualizationSettings(
        newQuestion,
        series,
      ).setting(key);
      newQuestion = newQuestion.updateSettings({ [key]: setting });
    }

    if (
      // switching to pivot
      (isPivot && !wasPivot && queryHasBreakouts) ||
      // switching away from pivot
      (!isPivot && wasPivot) ||
      // updating the pivot rows/cols
      (isPivot &&
        queryHasBreakouts &&
        !_.isEqual(
          newQuestion.setting("pivot_table.column_split"),
          oldQuestion.setting("pivot_table.column_split"),
        ))
    ) {
      run = true; // force a run when switching to/from pivot or updating it's setting
    }
    // </PIVOT LOGIC>

    // Native query should never be in notebook mode (metabase#12651)
    if (mode === "notebook" && newQuestion.isNative()) {
      await dispatch(
        setQueryBuilderMode("view", {
          shouldUpdateUrl: false,
        }),
      );
    }

    const newDatasetQuery = newQuestion.query().datasetQuery();
    // Sync card's parameters with the template tags;
    if (newDatasetQuery.type === "native") {
      const templateTags = getTemplateTagsForParameters(newQuestion.card());
      const parameters = getTemplateTagParameters(templateTags);
      newQuestion = newQuestion.setParameters(parameters);
    }

    // Replace the current question with a new one
    await dispatch.action(UPDATE_QUESTION, { card: newQuestion.card() });

    if (shouldUpdateUrl) {
      dispatch(updateUrl(null, { dirty: true }));
    }

    // See if the template tags editor should be shown/hidden
    const isTemplateTagEditorVisible = getIsShowingTemplateTagsEditor(
      getState(),
    );
    const nextTagEditorVisibilityState = getNextTemplateTagVisibilityState({
      oldQuestion,
      newQuestion,
      isTemplateTagEditorVisible,
      queryBuilderMode: mode,
    });
    if (nextTagEditorVisibilityState !== "deferToCurrentState") {
      dispatch(
        setIsShowingTemplateTagsEditor(
          nextTagEditorVisibilityState === "visible",
        ),
      );
    }

    try {
      if (
        !_.isEqual(
          oldQuestion.query().dependentMetadata(),
          newQuestion.query().dependentMetadata(),
        )
      ) {
        await dispatch(loadMetadataForCard(newQuestion.card()));
      }

      // setDefaultQuery requires metadata be loaded, need getQuestion to use new metadata
      const question = getQuestion(getState());
      const questionWithDefaultQuery = question.setDefaultQuery();
      if (!questionWithDefaultQuery.isEqual(question)) {
        await dispatch.action(UPDATE_QUESTION, {
          card: questionWithDefaultQuery.setDefaultDisplay().card(),
        });
      }
    } catch (e) {
      // this will fail if user doesn't have data permissions but thats ok
      console.warn("Couldn't load metadata", e);
    }

    // run updated query
    if (run) {
      dispatch(runQuestionQuery());
    }
  };
};

// DEPRECATED, still used in a couple places
export const setDatasetQuery =
  (datasetQuery, options) => (dispatch, getState) => {
    const question = getQuestion(getState());
    dispatch(updateQuestion(question.setDatasetQuery(datasetQuery), options));
  };

export const API_CREATE_QUESTION = "metabase/qb/API_CREATE_QUESTION";
export const apiCreateQuestion = question => {
  return async (dispatch, getState) => {
    // Needed for persisting visualization columns for pulses/alerts, see #6749
    const series = getTransformedSeries(getState());
    const questionWithVizSettings = series
      ? getQuestionWithDefaultVisualizationSettings(question, series)
      : question;

    const resultsMetadata = getResultsMetadata(getState());
    const createdQuestion = await questionWithVizSettings
      .setQuery(question.query().clean())
      .setResultsMetadata(resultsMetadata)
      .reduxCreate(dispatch);

    // remove the databases in the store that are used to populate the QB databases list.
    // This is done when saving a Card because the newly saved card will be eligible for use as a source query
    // so we want the databases list to be re-fetched next time we hit "New Question" so it shows up
    dispatch(setRequestUnloaded(["entities", "databases"]));

    dispatch(updateUrl(createdQuestion.card(), { dirty: false }));
    MetabaseAnalytics.trackStructEvent(
      "QueryBuilder",
      "Create Card",
      createdQuestion.query().datasetQuery().type,
    );
    trackNewQuestionSaved(
      question,
      createdQuestion,
      isBasedOnExistingQuestion(getState()),
    );

    // Saving a card, locks in the current display as though it had been
    // selected in the UI.
    const card = createdQuestion.lockDisplay().card();

    dispatch.action(API_CREATE_QUESTION, card);
  };
};

export const API_UPDATE_QUESTION = "metabase/qb/API_UPDATE_QUESTION";
export const apiUpdateQuestion = (question, { rerunQuery = false } = {}) => {
  return async (dispatch, getState) => {
    const originalQuestion = getOriginalQuestion(getState());
    question = question || getQuestion(getState());

    // Needed for persisting visualization columns for pulses/alerts, see #6749
    const series = getTransformedSeries(getState());
    const questionWithVizSettings = series
      ? getQuestionWithDefaultVisualizationSettings(question, series)
      : question;

    const resultsMetadata = getResultsMetadata(getState());
    const updatedQuestion = await questionWithVizSettings
      .setQuery(question.query().clean())
      .setResultsMetadata(resultsMetadata)
      // When viewing a dataset, its dataset_query is swapped with a clean query using the dataset as a source table
      // (it's necessary for datasets to behave like tables opened in simple mode)
      // When doing updates like changing name, description, etc., we need to omit the dataset_query in the request body
      .reduxUpdate(dispatch, {
        excludeDatasetQuery: isAdHocModelQuestion(question, originalQuestion),
      });

    // reload the question alerts for the current question
    // (some of the old alerts might be removed during update)
    await dispatch(fetchAlertsForQuestion(updatedQuestion.id()));

    // remove the databases in the store that are used to populate the QB databases list.
    // This is done when saving a Card because the newly saved card will be eligible for use as a source query
    // so we want the databases list to be re-fetched next time we hit "New Question" so it shows up
    dispatch(setRequestUnloaded(["entities", "databases"]));

    MetabaseAnalytics.trackStructEvent(
      "QueryBuilder",
      "Update Card",
      updatedQuestion.query().datasetQuery().type,
    );

    dispatch.action(API_UPDATE_QUESTION, updatedQuestion.card());

    if (rerunQuery) {
      const metadataOptions = { reload: question.isDataset() };
      await dispatch(loadMetadataForCard(question.card(), metadataOptions));
      dispatch(runQuestionQuery());
    }
  };
};

export const SET_PARAMETER_VALUE = "metabase/qb/SET_PARAMETER_VALUE";
export const setParameterValue = createAction(
  SET_PARAMETER_VALUE,
  (parameterId, value) => {
    return { id: parameterId, value };
  },
);

export const REVERT_TO_REVISION = "metabase/qb/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  revision => {
    return async dispatch => {
      await revision.revert();
      await dispatch(reloadCard());
    };
  },
);
