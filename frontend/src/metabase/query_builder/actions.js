/*@flow weak*/
import { fetchAlertsForQuestion } from "metabase/alert/alert";

declare var ace: any;

import { createAction } from "redux-actions";
import _ from "underscore";
import { assocIn } from "icepick";

import * as Urls from "metabase/lib/urls";

import { createThunkAction } from "metabase/lib/redux";
import { push, replace } from "react-router-redux";
import { setErrorPage } from "metabase/redux/app";

import MetabaseAnalytics from "metabase/lib/analytics";
import {
  loadCard,
  startNewCard,
  deserializeCardFromUrl,
  serializeCardForUrl,
  cleanCopyCard,
  urlForCardState,
} from "metabase/lib/card";
import { formatSQL } from "metabase/lib/formatting";
import Query, { createQuery } from "metabase/lib/query";
import { syncQueryFields, getExistingFields } from "metabase/lib/dataset";
import { isPK } from "metabase/lib/types";
import Utils from "metabase/lib/utils";
import { getEngineNativeType, formatJsonQuery } from "metabase/lib/engine";
import { defer } from "metabase/lib/promise";
import Question from "metabase-lib/lib/Question";
import { cardIsEquivalent, cardQueryIsEquivalent } from "metabase/meta/Card";

import {
  getTableMetadata,
  getNativeDatabases,
  getQuestion,
  getOriginalQuestion,
  getOriginalCard,
  getIsEditing,
  getIsShowingDataReference,
  getTransformedSeries,
  getResultsMetadata,
  getFirstQueryResult,
} from "./selectors";

import {
  getTables,
  getDatabasesList,
  getMetadata,
} from "metabase/selectors/metadata";

import { fetchDatabases, fetchTableMetadata } from "metabase/redux/metadata";

import { MetabaseApi, CardApi, UserApi } from "metabase/services";

import { parse as urlParse } from "url";
import querystring from "querystring";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";

import type { Card } from "metabase/meta/types/Card";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { getPersistableDefaultSettings } from "metabase/visualizations/lib/settings";
import { clearRequestState } from "metabase/redux/requests";

import Questions from "metabase/entities/questions";

type UiControls = {
  isEditing?: boolean,
  isShowingTemplateTagsEditor?: boolean,
  isShowingNewbModal?: boolean,
  isShowingTutorial?: boolean,
};

const getTemplateTagCount = (question: Question) => {
  const query = question.query();
  return query instanceof NativeQuery ? query.templateTags().length : 0;
};

export const SET_CURRENT_STATE = "metabase/qb/SET_CURRENT_STATE";
const setCurrentState = createAction(SET_CURRENT_STATE);

export const POP_STATE = "metabase/qb/POP_STATE";
export const popState = createThunkAction(
  POP_STATE,
  location => async (dispatch, getState) => {
    const { card } = getState().qb;
    if (location.state && location.state.card) {
      if (!Utils.equals(card, location.state.card)) {
        dispatch(setCardAndRun(location.state.card, false));
        dispatch(setCurrentState(location.state));
      }
    }
  },
);

export const CREATE_PUBLIC_LINK = "metabase/card/CREATE_PUBLIC_LINK";
export const createPublicLink = createAction(CREATE_PUBLIC_LINK, ({ id }) =>
  CardApi.createPublicLink({ id }),
);

export const DELETE_PUBLIC_LINK = "metabase/card/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAction(DELETE_PUBLIC_LINK, ({ id }) =>
  CardApi.deletePublicLink({ id }),
);

export const UPDATE_ENABLE_EMBEDDING = "metabase/card/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(
  UPDATE_ENABLE_EMBEDDING,
  ({ id }, enable_embedding) => CardApi.update({ id, enable_embedding }),
);

export const UPDATE_EMBEDDING_PARAMS = "metabase/card/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }, embedding_params) => CardApi.update({ id, embedding_params }),
);

// TODO Atte Keinänen 6/8/17: Should use the stored question by default instead of requiring an explicit `card` parameter
export const UPDATE_URL = "metabase/qb/UPDATE_URL";
export const updateUrl = createThunkAction(
  UPDATE_URL,
  (
    card,
    { dirty = false, replaceState = false, preserveParameters = true },
  ) => (dispatch, getState) => {
    if (!card) {
      return;
    }
    let copy = cleanCopyCard(card);
    let newState = {
      card: copy,
      cardId: copy.id,
      serializedCard: serializeCardForUrl(copy),
    };

    const { currentState } = getState().qb;

    if (Utils.equals(currentState, newState)) {
      return;
    }

    let url = urlForCardState(newState, dirty);

    // if the serialized card is identical replace the previous state instead of adding a new one
    // e.x. when saving a new card we want to replace the state and URL with one with the new card ID
    replaceState =
      replaceState ||
      (currentState && currentState.serializedCard === newState.serializedCard);

    const urlParsed = urlParse(url);
    const locationDescriptor = {
      pathname: urlParsed.pathname,
      search: preserveParameters ? window.location.search : "",
      hash: urlParsed.hash,
      state: newState,
    };

    if (
      locationDescriptor.pathname === window.location.pathname &&
      (locationDescriptor.search || "") === (window.location.search || "") &&
      (locationDescriptor.hash || "") === (window.location.hash || "")
    ) {
      replaceState = true;
    }

    // this is necessary because we can't get the state from history.state
    dispatch(setCurrentState(newState));
    if (replaceState) {
      dispatch(replace(locationDescriptor));
    } else {
      dispatch(push(locationDescriptor));
    }
  },
);

export const REDIRECT_TO_NEW_QUESTION_FLOW =
  "metabase/qb/REDIRECT_TO_NEW_QUESTION_FLOW";
export const redirectToNewQuestionFlow = createThunkAction(
  REDIRECT_TO_NEW_QUESTION_FLOW,
  () => (dispatch, getState) => dispatch(replace("/question/new")),
);

export const RESET_QB = "metabase/qb/RESET_QB";
export const resetQB = createAction(RESET_QB);

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const initializeQB = (location, params) => {
  return async (dispatch, getState) => {
    // do this immediately to ensure old state is cleared before the user sees it
    dispatch(resetQB());
    dispatch(cancelQuery());

    const { currentUser } = getState();

    let card, databasesList, originalCard;
    let uiControls: UiControls = {
      isEditing: false,
      isShowingTemplateTagsEditor: false,
    };

    // always start the QB by loading up the databases for the application
    try {
      await dispatch(fetchDatabases());
      databasesList = getDatabasesList(getState());
    } catch (error) {
      console.error("error fetching dbs", error);
      // NOTE: don't actually error if dbs can't be fetched for some reason,
      // we may still be able to run the query
      // NOTE: for some reason previously fetchDatabases would fall back to []
      // if there was an API error so this would never be hit
      // dispatch(setErrorPage(error));
      // return { uiControls };
    }

    // load up or initialize the card we'll be working on
    let options = {};
    let serializedCard;
    // hash can contain either query params starting with ? or a base64 serialized card
    if (location.hash) {
      let hash = location.hash.replace(/^#/, "");
      if (hash.charAt(0) === "?") {
        options = querystring.parse(hash.substring(1));
      } else {
        serializedCard = hash;
      }
    }
    const sampleDataset = _.findWhere(databasesList, { is_sample: true });

    let preserveParameters = false;
    if (params.cardId || serializedCard) {
      // existing card being loaded
      try {
        // if we have a serialized card then unpack it and use it
        card = serializedCard ? deserializeCardFromUrl(serializedCard) : {};

        // load the card either from `cardId` parameter or the serialized card
        if (params.cardId) {
          card = await loadCard(params.cardId);
          // when we are loading from a card id we want an explicit clone of the card we loaded which is unmodified
          originalCard = Utils.copy(card);
          // for showing the "started from" lineage correctly when adding filters/breakouts and when going back and forth
          // in browser history, the original_card_id has to be set for the current card (simply the id of card itself for now)
          card.original_card_id = card.id;
        } else if (card.original_card_id) {
          // deserialized card contains the card id, so just populate originalCard
          originalCard = await loadCard(card.original_card_id);
          // if the cards are equal then show the original
          if (cardIsEquivalent(card, originalCard)) {
            card = Utils.copy(originalCard);
          }
        }

        MetabaseAnalytics.trackEvent(
          "QueryBuilder",
          "Query Loaded",
          card.dataset_query.type,
        );

        // if we have deserialized card from the url AND loaded a card by id then the user should be dropped into edit mode
        uiControls.isEditing = !!options.edit;

        // if this is the users first time loading a saved card on the QB then show them the newb modal
        if (params.cardId && currentUser.is_qbnewb) {
          uiControls.isShowingNewbModal = true;
          MetabaseAnalytics.trackEvent("QueryBuilder", "Show Newb Modal");
        }

        if (card.archived) {
          // use the error handler in App.jsx for showing "This question has been archived" message
          dispatch(
            setErrorPage({
              data: {
                error_code: "archived",
              },
              context: "query-builder",
            }),
          );
          card = null;
        }

        preserveParameters = true;
      } catch (error) {
        console.warn("initializeQb failed because of an error:", error);
        card = null;
        dispatch(setErrorPage(error));
      }
    } else if (options.tutorial !== undefined && sampleDataset) {
      // we are launching the QB tutorial
      card = startNewCard("query", sampleDataset.id);

      uiControls.isShowingTutorial = true;
      MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Start", true);
    } else {
      // we are starting a new/empty card
      // if no options provided in the hash, redirect to the new question flow
      if (
        !options.db &&
        !options.table &&
        !options.segment &&
        !options.metric
      ) {
        await dispatch(redirectToNewQuestionFlow());
        return;
      }

      const databaseId = options.db ? parseInt(options.db) : undefined;
      card = startNewCard("query", databaseId);

      // initialize parts of the query based on optional parameters supplied
      if (options.table != undefined && card.dataset_query.query) {
        card.dataset_query.query.source_table = parseInt(options.table);
      }

      if (options.segment != undefined && card.dataset_query.query) {
        card.dataset_query.query.filter = [
          "AND",
          ["SEGMENT", parseInt(options.segment)],
        ];
      }

      if (options.metric != undefined && card.dataset_query.query) {
        card.dataset_query.query.aggregation = [
          "METRIC",
          parseInt(options.metric),
        ];
      }

      MetabaseAnalytics.trackEvent(
        "QueryBuilder",
        "Query Started",
        card.dataset_query.type,
      );
    }

    /**** All actions are dispatched here ****/

    // Update the question to Redux state together with the initial state of UI controls
    dispatch.action(INITIALIZE_QB, {
      card,
      originalCard,
      uiControls,
    });

    // Fetch alerts for the current question if the question is saved
    card && card.id && dispatch(fetchAlertsForQuestion(card.id));

    // Fetch the question metadata
    card && dispatch(loadMetadataForCard(card));

    const question = card && new Question(getMetadata(getState()), card);

    // if we have loaded up a card that we can run then lets kick that off as well
    if (question) {
      if (question.canRun()) {
        // NOTE: timeout to allow Parameters widget to set parameterValues
        setTimeout(
          () =>
            // TODO Atte Keinänen 5/31/17: Check if it is dangerous to create a question object without metadata
            dispatch(runQuestionQuery({ shouldUpdateUrl: false })),
          0,
        );
      }

      // clean up the url and make sure it reflects our card state
      const originalQuestion =
        originalCard && new Question(getMetadata(getState()), originalCard);
      dispatch(
        updateUrl(card, {
          dirty:
            !originalQuestion ||
            (originalQuestion && question.isDirtyComparedTo(originalQuestion)),
          replaceState: true,
          preserveParameters,
        }),
      );
    }
  };
};

export const TOGGLE_DATA_REFERENCE = "metabase/qb/TOGGLE_DATA_REFERENCE";
export const toggleDataReference = createAction(TOGGLE_DATA_REFERENCE, () => {
  MetabaseAnalytics.trackEvent("QueryBuilder", "Toggle Data Reference");
});

export const TOGGLE_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/TOGGLE_TEMPLATE_TAGS_EDITOR";
export const toggleTemplateTagsEditor = createAction(
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Toggle Template Tags Editor");
  },
);

export const SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR";
export const setIsShowingTemplateTagsEditor = isShowingTemplateTagsEditor => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});

export const CLOSE_QB_TUTORIAL = "metabase/qb/CLOSE_QB_TUTORIAL";
export const closeQbTutorial = createAction(CLOSE_QB_TUTORIAL, () => {
  MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Close");
});

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (dispatch, getState) => {
    // persist the fact that this user has seen the NewbModal
    const { currentUser } = getState();
    await UserApi.update_qbnewb({ id: currentUser.id });
    MetabaseAnalytics.trackEvent("QueryBuilder", "Close Newb Modal");
  };
});

export const BEGIN_EDITING = "metabase/qb/BEGIN_EDITING";
export const beginEditing = createAction(BEGIN_EDITING, () => {
  MetabaseAnalytics.trackEvent("QueryBuilder", "Edit Begin");
});

export const CANCEL_EDITING = "metabase/qb/CANCEL_EDITING";
export const cancelEditing = createThunkAction(CANCEL_EDITING, () => {
  return (dispatch, getState) => {
    // clone
    let card = Utils.copy(getOriginalCard(getState()));

    dispatch(loadMetadataForCard(card));

    // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
    dispatch(
      runQuestionQuery({ overrideWithCard: card, shouldUpdateUrl: false }),
    );
    dispatch(updateUrl(card, { dirty: false }));

    MetabaseAnalytics.trackEvent("QueryBuilder", "Edit Cancel");
    return card;
  };
});

// TODO Atte Keinänen 6/8/17: Could (should?) use the stored question by default instead of always requiring the explicit `card` parameter
export const LOAD_METADATA_FOR_CARD = "metabase/qb/LOAD_METADATA_FOR_CARD";
export const loadMetadataForCard = createThunkAction(
  LOAD_METADATA_FOR_CARD,
  card => {
    return async (dispatch, getState) => {
      // Short-circuit if we're in a weird state where the card isn't completely loaded
      if (!card && !card.dataset_query) {
        return;
      }

      const query = card && new Question(getMetadata(getState()), card).query();

      async function loadMetadataForAtomicQuery(singleQuery) {
        if (
          singleQuery instanceof StructuredQuery &&
          singleQuery.tableId() != null
        ) {
          await dispatch(loadTableMetadata(singleQuery.tableId()));
        }

        // NOTE Atte Keinänen 1/29/18:
        // For native queries we don't normally know which table(s) we are working on.
        // We could load all tables of the current database but historically that has caused
        // major performance problems with users having large databases.
        // Now components needing table metadata fetch it on-demand.
      }

      if (query) {
        await loadMetadataForAtomicQuery(query);
      }
    };
  },
);

export const LOAD_TABLE_METADATA = "metabase/qb/LOAD_TABLE_METADATA";
export const loadTableMetadata = createThunkAction(
  LOAD_TABLE_METADATA,
  tableId => {
    return async (dispatch, getState) => {
      try {
        await dispatch(fetchTableMetadata(tableId));
        // TODO: finish moving this to metadata duck:
        const foreignKeys = await MetabaseApi.table_fks({ tableId });
        return { foreignKeys };
      } catch (error) {
        console.error("error getting table metadata", error);
        return {};
      }
    };
  },
);

// TODO Atte Keinänen 7/5/17: Move the API call to redux/metadata for being able to see the db fields in the new metadata object
export const LOAD_DATABASE_FIELDS = "metabase/qb/LOAD_DATABASE_FIELDS";
export const loadDatabaseFields = createThunkAction(
  LOAD_DATABASE_FIELDS,
  dbId => {
    return async (dispatch, getState) => {
      // if we already have the metadata loaded for the given table then we are done
      const { qb: { databaseFields } } = getState();
      try {
        let fields;
        if (databaseFields[dbId]) {
          fields = databaseFields[dbId];
        } else {
          fields = await MetabaseApi.db_fields({ dbId: dbId });
        }

        return {
          id: dbId,
          fields: fields,
        };
      } catch (error) {
        console.error("error getting database fields", error);
        return {};
      }
    };
  },
);

function updateVisualizationSettings(
  card,
  isEditing,
  display,
  vizSettings,
  result,
) {
  // don't need to store undefined
  vizSettings = Utils.copy(vizSettings);
  for (const name in vizSettings) {
    if (vizSettings[name] === undefined) {
      delete vizSettings[name];
    }
  }

  // make sure that something actually changed
  if (
    card.display === display &&
    _.isEqual(card.visualization_settings, vizSettings)
  ) {
    return card;
  }

  let updatedCard = Utils.copy(card);

  // when the visualization changes on saved card we change this into a new card w/ a known starting point
  if (!isEditing && updatedCard.id) {
    delete updatedCard.id;
    delete updatedCard.name;
    delete updatedCard.description;
  }

  updatedCard.display = display;
  updatedCard.visualization_settings = vizSettings;

  if (result && result.data && result.data.cols) {
    syncQueryFields(updatedCard, result.data.cols);
  }

  return updatedCard;
}

export const SET_CARD_ATTRIBUTE = "metabase/qb/SET_CARD_ATTRIBUTE";
export const setCardAttribute = createAction(
  SET_CARD_ATTRIBUTE,
  (attr, value) => ({ attr, value }),
);

export const SET_CARD_VISUALIZATION = "metabase/qb/SET_CARD_VISUALIZATION";
export const setCardVisualization = createThunkAction(
  SET_CARD_VISUALIZATION,
  display => {
    return (dispatch, getState) => {
      const { qb: { card, uiControls } } = getState();
      let updatedCard = updateVisualizationSettings(
        card,
        uiControls.isEditing,
        display,
        card.visualization_settings,
        getFirstQueryResult(getState()),
      );
      dispatch(updateUrl(updatedCard, { dirty: true }));
      return updatedCard;
    };
  },
);

export const UPDATE_CARD_VISUALIZATION_SETTINGS =
  "metabase/qb/UPDATE_CARD_VISUALIZATION_SETTINGS";
export const updateCardVisualizationSettings = createThunkAction(
  UPDATE_CARD_VISUALIZATION_SETTINGS,
  settings => {
    return (dispatch, getState) => {
      const { qb: { card, uiControls } } = getState();
      let updatedCard = updateVisualizationSettings(
        card,
        uiControls.isEditing,
        card.display,
        { ...card.visualization_settings, ...settings },
        getFirstQueryResult(getState()),
      );
      dispatch(updateUrl(updatedCard, { dirty: true }));
      return updatedCard;
    };
  },
);

export const REPLACE_ALL_CARD_VISUALIZATION_SETTINGS =
  "metabase/qb/REPLACE_ALL_CARD_VISUALIZATION_SETTINGS";
export const replaceAllCardVisualizationSettings = createThunkAction(
  REPLACE_ALL_CARD_VISUALIZATION_SETTINGS,
  settings => {
    return (dispatch, getState) => {
      const { qb: { card, uiControls } } = getState();
      let updatedCard = updateVisualizationSettings(
        card,
        uiControls.isEditing,
        card.display,
        settings,
        getFirstQueryResult(getState()),
      );
      dispatch(updateUrl(updatedCard, { dirty: true }));
      return updatedCard;
    };
  },
);

export const UPDATE_TEMPLATE_TAG = "metabase/qb/UPDATE_TEMPLATE_TAG";
export const updateTemplateTag = createThunkAction(
  UPDATE_TEMPLATE_TAG,
  templateTag => {
    return (dispatch, getState) => {
      const { qb: { card, uiControls } } = getState();

      let updatedCard = Utils.copy(card);

      // when the query changes on saved card we change this into a new query w/ a known starting point
      if (!uiControls.isEditing && updatedCard.id) {
        delete updatedCard.id;
        delete updatedCard.name;
        delete updatedCard.description;
      }

      return assocIn(
        updatedCard,
        ["dataset_query", "native", "template_tags", templateTag.name],
        templateTag,
      );
    };
  },
);

export const SET_PARAMETER_VALUE = "metabase/qb/SET_PARAMETER_VALUE";
export const setParameterValue = createAction(
  SET_PARAMETER_VALUE,
  (parameterId, value) => {
    return { id: parameterId, value };
  },
);

// reloadCard
export const RELOAD_CARD = "metabase/qb/RELOAD_CARD";
export const reloadCard = createThunkAction(RELOAD_CARD, () => {
  return async (dispatch, getState) => {
    // clone
    let card = Utils.copy(getOriginalCard(getState()));

    dispatch(loadMetadataForCard(card));

    // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
    dispatch(
      runQuestionQuery({ overrideWithCard: card, shouldUpdateUrl: false }),
    );
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
        card.id ? card : null;

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
 *         * (not in 0.24.2 yet: drag on line/area/bar visualization)
 *     - clicking an action widget action
 *
 * All these events can be applied either for an unsaved question or a saved question.
 */
export const NAVIGATE_TO_NEW_CARD = "metabase/qb/NAVIGATE_TO_NEW_CARD";
export const navigateToNewCardInsideQB = createThunkAction(
  NAVIGATE_TO_NEW_CARD,
  ({ nextCard, previousCard }) => {
    return async (dispatch, getState) => {
      if (cardIsEquivalent(previousCard, nextCard)) {
        // This is mainly a fallback for scenarios where a visualization legend is clicked inside QB
        dispatch(setCardAndRun(await loadCard(nextCard.id)));
      } else {
        if (!cardQueryIsEquivalent(previousCard, nextCard)) {
          // clear the query result so we don't try to display the new visualization before running the new query
          dispatch(clearQueryResult());
        }
        dispatch(
          setCardAndRun(getCardAfterVisualizationClick(nextCard, previousCard)),
        );
      }
    };
  },
);

// TODO Atte Keinänen 6/2/2017 See if we should stick to `updateX` naming convention instead of `setX` in all Redux actions
// We talked with Tom that `setX` method names could be reserved to metabase-lib classes

/**
 * Replaces the currently actived question with the given Question object.
 * Also shows/hides the template tag editor if the number of template tags has changed.
 */
export const UPDATE_QUESTION = "metabase/qb/UPDATE_QUESTION";
export const updateQuestion = (newQuestion, { doNotClearNameAndId } = {}) => {
  return (dispatch, getState) => {
    // TODO Atte Keinänen 6/2/2017 Ways to have this happen automatically when modifying a question?
    // Maybe the Question class or a QB-specific question wrapper class should know whether it's being edited or not?
    if (
      !doNotClearNameAndId &&
      !getIsEditing(getState()) &&
      newQuestion.isSaved()
    ) {
      newQuestion = newQuestion.withoutNameAndId();
    }

    // Replace the current question with a new one
    dispatch.action(UPDATE_QUESTION, { card: newQuestion.card() });

    // See if the template tags editor should be shown/hidden
    const oldQuestion = getQuestion(getState());
    const oldTagCount = getTemplateTagCount(oldQuestion);
    const newTagCount = getTemplateTagCount(newQuestion);

    if (newTagCount > oldTagCount) {
      dispatch(setIsShowingTemplateTagsEditor(true));
    } else if (newTagCount === 0 && !getIsShowingDataReference(getState())) {
      dispatch(setIsShowingTemplateTagsEditor(false));
    }
  };
};

export const API_CREATE_QUESTION = "metabase/qb/API_CREATE_QUESTION";
export const apiCreateQuestion = question => {
  return async (dispatch, getState) => {
    // Needed for persisting visualization columns for pulses/alerts, see #6749
    const series = getTransformedSeries(getState());
    const questionWithVizSettings = series
      ? getQuestionWithDefaultVisualizationSettings(question, series)
      : question;

    let resultsMetadata = getResultsMetadata(getState());
    const createdQuestion = await questionWithVizSettings
      .setQuery(question.query().clean())
      .setResultsMetadata(resultsMetadata)
      .reduxCreate(dispatch);

    // remove the databases in the store that are used to populate the QB databases list.
    // This is done when saving a Card because the newly saved card will be eligible for use as a source query
    // so we want the databases list to be re-fetched next time we hit "New Question" so it shows up
    dispatch(clearRequestState({ statePath: ["entities", "databases"] }));

    dispatch(updateUrl(createdQuestion.card(), { dirty: false }));
    MetabaseAnalytics.trackEvent(
      "QueryBuilder",
      "Create Card",
      createdQuestion.query().datasetQuery().type,
    );

    dispatch.action(API_CREATE_QUESTION, createdQuestion.card());
  };
};

export const API_UPDATE_QUESTION = "metabase/qb/API_UPDATE_QUESTION";
export const apiUpdateQuestion = question => {
  return async (dispatch, getState) => {
    question = question || getQuestion(getState());

    // Needed for persisting visualization columns for pulses/alerts, see #6749
    const series = getTransformedSeries(getState());
    const questionWithVizSettings = series
      ? getQuestionWithDefaultVisualizationSettings(question, series)
      : question;

    let resultsMetadata = getResultsMetadata(getState());
    const updatedQuestion = await questionWithVizSettings
      .setQuery(question.query().clean())
      .setResultsMetadata(resultsMetadata)
      .reduxUpdate(dispatch);

    // reload the question alerts for the current question
    // (some of the old alerts might be removed during update)
    await dispatch(fetchAlertsForQuestion(updatedQuestion.id()));

    // remove the databases in the store that are used to populate the QB databases list.
    // This is done when saving a Card because the newly saved card will be eligible for use as a source query
    // so we want the databases list to be re-fetched next time we hit "New Question" so it shows up
    dispatch(clearRequestState({ statePath: ["entities", "databases"] }));

    dispatch(updateUrl(updatedQuestion.card(), { dirty: false }));
    MetabaseAnalytics.trackEvent(
      "QueryBuilder",
      "Update Card",
      updatedQuestion.query().datasetQuery().type,
    );

    dispatch.action(API_UPDATE_QUESTION, updatedQuestion.card());
  };
};

// setDatasetQuery
// TODO Atte Keinänen 6/1/17: Deprecated, superseded by updateQuestion
export const SET_DATASET_QUERY = "metabase/qb/SET_DATASET_QUERY";
export const setDatasetQuery = createThunkAction(
  SET_DATASET_QUERY,
  (dataset_query, run = false) => {
    return (dispatch, getState) => {
      const { qb: { uiControls } } = getState();
      const question = getQuestion(getState());

      let newQuestion = question;

      // when the query changes on saved card we change this into a new query w/ a known starting point
      if (!uiControls.isEditing && question.isSaved()) {
        newQuestion = newQuestion.withoutNameAndId();
      }

      newQuestion = newQuestion.setDatasetQuery(dataset_query);

      const oldTagCount = getTemplateTagCount(question);
      const newTagCount = getTemplateTagCount(newQuestion);

      let openTemplateTagsEditor = uiControls.isShowingTemplateTagsEditor;
      if (newTagCount > oldTagCount) {
        openTemplateTagsEditor = true;
      } else if (newTagCount === 0) {
        openTemplateTagsEditor = false;
      }

      // run updated query
      if (run) {
        dispatch(runQuestionQuery({ overrideWithCard: newQuestion.card() }));
      }

      return {
        card: newQuestion.card(),
        openTemplateTagsEditor,
      };
    };
  },
);

// setQueryMode
export const SET_QUERY_MODE = "metabase/qb/SET_QUERY_MODE";
export const setQueryMode = createThunkAction(SET_QUERY_MODE, type => {
  return (dispatch, getState) => {
    // TODO Atte Keinänen 6/1/17: Should use `queryResults` instead
    const { qb: { card, uiControls } } = getState();
    const queryResult = getFirstQueryResult(getState());
    const tableMetadata = getTableMetadata(getState());

    // if the type didn't actually change then nothing has been modified
    if (type === card.dataset_query.type) {
      return card;
    }

    // if we are going from MBQL -> Native then attempt to carry over the query
    if (
      type === "native" &&
      queryResult &&
      queryResult.data &&
      queryResult.data.native_form
    ) {
      let updatedCard = Utils.copy(card);
      let datasetQuery = updatedCard.dataset_query;
      let nativeQuery = _.pick(
        queryResult.data.native_form,
        "query",
        "collection",
      );

      // when the driver requires JSON we need to stringify it because it's been parsed already
      if (getEngineNativeType(tableMetadata.db.engine) === "json") {
        nativeQuery.query = formatJsonQuery(
          queryResult.data.native_form.query,
          tableMetadata.db.engine,
        );
      } else {
        nativeQuery.query = formatSQL(nativeQuery.query);
      }

      datasetQuery.type = "native";
      datasetQuery.native = nativeQuery;
      delete datasetQuery.query;

      // when the query changes on saved card we change this into a new query w/ a known starting point
      if (!uiControls.isEditing && updatedCard.id) {
        delete updatedCard.id;
        delete updatedCard.name;
        delete updatedCard.description;
      }

      updatedCard.dataset_query = datasetQuery;

      dispatch(loadMetadataForCard(updatedCard));

      MetabaseAnalytics.trackEvent("QueryBuilder", "MBQL->Native");

      return updatedCard;

      // we are translating an empty query
    } else {
      let databaseId = card.dataset_query.database;

      // only carry over the database id if the user can write native queries
      if (type === "native") {
        let nativeDatabases = getNativeDatabases(getState());
        if (!_.findWhere(nativeDatabases, { id: databaseId })) {
          databaseId =
            nativeDatabases.length > 0 ? nativeDatabases[0].id : null;
        }
      }

      let newCard = startNewCard(type, databaseId);

      dispatch(loadMetadataForCard(newCard));

      return newCard;
    }
  };
});

// TODO Atte Keinänen: The heavy lifting should be moved to StructuredQuery and NativeQuery
// Question.js could possibly provide a helper method like `Question.setDatabaseId` that delegates it to respective query classes

// setQueryDatabase
export const SET_QUERY_DATABASE = "metabase/qb/SET_QUERY_DATABASE";
export const setQueryDatabase = createThunkAction(
  SET_QUERY_DATABASE,
  databaseId => {
    return async (dispatch, getState) => {
      const { qb: { card, uiControls } } = getState();

      // picking the same database doesn't change anything
      if (databaseId === card.dataset_query.database) {
        return card;
      }

      let existingQuery = card.dataset_query.native
        ? card.dataset_query.native.query
        : undefined;
      if (!uiControls.isEditing) {
        let updatedCard = startNewCard(card.dataset_query.type, databaseId);
        if (existingQuery) {
          updatedCard.dataset_query.native.query = existingQuery;
          updatedCard.dataset_query.native.template_tags =
            card.dataset_query.native.template_tags;
        }

        // set the initial collection for the query if this is a native query
        // this is only used for Mongo queries which need to be ran against a specific collection
        const question = new Question(getMetadata(getState()), updatedCard);
        const query = question.query();
        if (query instanceof NativeQuery && query.requiresTable()) {
          const tables = query.tables();
          if (tables && tables.length > 0) {
            updatedCard.dataset_query.native.collection = tables[0].name;
          }
        }

        dispatch(loadMetadataForCard(updatedCard));

        return updatedCard;
      } else {
        // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
        // TODO: should this clear the visualization as well?
        let updatedCard = Utils.copy(card);
        updatedCard.dataset_query = createQuery(
          card.dataset_query.type,
          databaseId,
        );
        if (existingQuery) {
          updatedCard.dataset_query.native.query = existingQuery;
          updatedCard.dataset_query.native.template_tags =
            card.dataset_query.native.template_tags;
        }

        dispatch(loadMetadataForCard(updatedCard));

        return updatedCard;
      }
    };
  },
);

// TODO Atte Keinänen: The heavy lifting should be moved to StructuredQuery and NativeQuery
// Question.js could possibly provide a helper method like `Question.setSourceTable` that delegates it to respective query classes

// setQuerySourceTable
export const SET_QUERY_SOURCE_TABLE = "metabase/qb/SET_QUERY_SOURCE_TABLE";
export const setQuerySourceTable = createThunkAction(
  SET_QUERY_SOURCE_TABLE,
  sourceTable => {
    return async (dispatch, getState) => {
      const { qb: { card, uiControls } } = getState();

      // this will either be the id or an object with an id
      const tableId = sourceTable.id || sourceTable;

      // if the table didn't actually change then nothing is modified
      if (tableId === card.dataset_query.query.source_table) {
        return card;
      }

      // load up all the table metadata via the api
      dispatch(loadTableMetadata(tableId));

      // find the database associated with this table
      let databaseId;
      if (_.isObject(sourceTable)) {
        databaseId = sourceTable.db_id;
      } else {
        const table = getTables(getState())[tableId];
        if (table) {
          databaseId = table.db_id;
        }
      }

      if (!uiControls.isEditing) {
        return startNewCard(card.dataset_query.type, databaseId, tableId);
      } else {
        // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
        // TODO: should this clear the visualization as well?
        let query = createQuery(card.dataset_query.type, databaseId, tableId);

        let updatedCard = Utils.copy(card);
        updatedCard.dataset_query = query;
        return updatedCard;
      }
    };
  },
);

function createQueryAction(action, updaterFunction, event) {
  return createThunkAction(action, (...args) => (dispatch, getState) => {
    const { qb: { card } } = getState();
    if (card.dataset_query.type === "query") {
      const datasetQuery = Utils.copy(card.dataset_query);
      updaterFunction(datasetQuery.query, ...args);
      dispatch(setDatasetQuery(datasetQuery));
      MetabaseAnalytics.trackEvent(
        ...(typeof event === "function" ? event(...args) : event),
      );
    }
    return null;
  });
}

export const addQueryBreakout = createQueryAction(
  "metabase/qb/ADD_QUERY_BREAKOUT",
  Query.addBreakout,
  ["QueryBuilder", "Add GroupBy"],
);
export const updateQueryBreakout = createQueryAction(
  "metabase/qb/UPDATE_QUERY_BREAKOUT",
  Query.updateBreakout,
  ["QueryBuilder", "Modify GroupBy"],
);
export const removeQueryBreakout = createQueryAction(
  "metabase/qb/REMOVE_QUERY_BREAKOUT",
  Query.removeBreakout,
  ["QueryBuilder", "Remove GroupBy"],
);
// Exported for integration tests
export const ADD_QUERY_FILTER = "metabase/qb/ADD_QUERY_FILTER";
export const addQueryFilter = createQueryAction(
  ADD_QUERY_FILTER,
  Query.addFilter,
  ["QueryBuilder", "Add Filter"],
);
export const UPDATE_QUERY_FILTER = "metabase/qb/UPDATE_QUERY_FILTER";
export const updateQueryFilter = createQueryAction(
  UPDATE_QUERY_FILTER,
  Query.updateFilter,
  ["QueryBuilder", "Modify Filter"],
);
export const REMOVE_QUERY_FILTER = "metabase/qb/REMOVE_QUERY_FILTER";
export const removeQueryFilter = createQueryAction(
  REMOVE_QUERY_FILTER,
  Query.removeFilter,
  ["QueryBuilder", "Remove Filter"],
);
export const addQueryAggregation = createQueryAction(
  "metabase/qb/ADD_QUERY_AGGREGATION",
  Query.addAggregation,
  ["QueryBuilder", "Add Aggregation"],
);
export const updateQueryAggregation = createQueryAction(
  "metabase/qb/UPDATE_QUERY_AGGREGATION",
  Query.updateAggregation,
  ["QueryBuilder", "Set Aggregation"],
);
export const removeQueryAggregation = createQueryAction(
  "metabase/qb/REMOVE_QUERY_AGGREGATION",
  Query.removeAggregation,
  ["QueryBuilder", "Remove Aggregation"],
);
export const addQueryOrderBy = createQueryAction(
  "metabase/qb/ADD_QUERY_ORDER_BY",
  Query.addOrderBy,
  ["QueryBuilder", "Add OrderBy"],
);
export const updateQueryOrderBy = createQueryAction(
  "metabase/qb/UPDATE_QUERY_ORDER_BY",
  Query.updateOrderBy,
  ["QueryBuilder", "Set OrderBy"],
);
export const removeQueryOrderBy = createQueryAction(
  "metabase/qb/REMOVE_QUERY_ORDER_BY",
  Query.removeOrderBy,
  ["QueryBuilder", "Remove OrderBy"],
);
export const updateQueryLimit = createQueryAction(
  "metabase/qb/UPDATE_QUERY_LIMIT",
  Query.updateLimit,
  ["QueryBuilder", "Update Limit"],
);
export const addQueryExpression = createQueryAction(
  "metabase/qb/ADD_QUERY_EXPRESSION",
  Query.addExpression,
  ["QueryBuilder", "Add Expression"],
);
export const updateQueryExpression = createQueryAction(
  "metabase/qb/UPDATE_QUERY_EXPRESSION",
  Query.updateExpression,
  ["QueryBuilder", "Set Expression"],
);
export const removeQueryExpression = createQueryAction(
  "metabase/qb/REMOVE_QUERY_EXPRESSION",
  Query.removeExpression,
  ["QueryBuilder", "Remove Expression"],
);

/**
 * Queries the result for the currently active question or alternatively for the card provided in `overrideWithCard`.
 * The API queries triggered by this action creator can be cancelled using the deferred provided in RUN_QUERY action.
 */
export type RunQueryParams = {
  shouldUpdateUrl?: boolean,
  ignoreCache?: boolean, // currently only implemented for saved cards
  overrideWithCard?: Card, // override the current question with the provided card
};
export const RUN_QUERY = "metabase/qb/RUN_QUERY";
export const runQuestionQuery = ({
  shouldUpdateUrl = true,
  ignoreCache = false,
  overrideWithCard,
}: RunQueryParams = {}) => {
  return async (dispatch, getState) => {
    const questionFromCard = (c: Card): Question =>
      c && new Question(getMetadata(getState()), c);

    const question: Question = overrideWithCard
      ? questionFromCard(overrideWithCard)
      : getQuestion(getState());
    const originalQuestion: ?Question = getOriginalQuestion(getState());

    const cardIsDirty = originalQuestion
      ? question.isDirtyComparedTo(originalQuestion)
      : true;

    if (shouldUpdateUrl) {
      dispatch(updateUrl(question.card(), { dirty: cardIsDirty }));
    }

    const startTime = new Date();
    const cancelQueryDeferred = defer();

    question
      .apiGetResults({
        cancelDeferred: cancelQueryDeferred,
        isDirty: cardIsDirty,
      })
      .then(queryResults =>
        dispatch(queryCompleted(question.card(), queryResults)),
      )
      .catch(error => dispatch(queryErrored(startTime, error)));

    MetabaseAnalytics.trackEvent(
      "QueryBuilder",
      "Run Query",
      question.query().datasetQuery().type,
    );

    // TODO Move this out from Redux action asap
    // HACK: prevent SQL editor from losing focus
    try {
      ace.edit("id_sql").focus();
    } catch (e) {}

    dispatch.action(RUN_QUERY, { cancelQueryDeferred });
  };
};

export const CLEAR_QUERY_RESULT = "metabase/query_builder/CLEAR_QUERY_RESULT";
export const clearQueryResult = createAction(CLEAR_QUERY_RESULT);

export const getDisplayTypeForCard = (card, queryResults) => {
  // TODO Atte Keinänen 6/1/17: Make a holistic decision based on all queryResults, not just one
  // This method seems to has been a candidate for a rewrite anyway
  const queryResult = queryResults[0];

  let cardDisplay = card.display;

  // try a little logic to pick a smart display for the data
  // TODO: less hard-coded rules for picking chart type
  const isScalarVisualization =
    card.display === "scalar" || card.display === "progress";
  if (
    !isScalarVisualization &&
    queryResult.data.rows &&
    queryResult.data.rows.length === 1 &&
    queryResult.data.cols.length === 1
  ) {
    // if we have a 1x1 data result then this should always be viewed as a scalar
    cardDisplay = "scalar";
  } else if (
    isScalarVisualization &&
    queryResult.data.rows &&
    (queryResult.data.rows.length > 1 || queryResult.data.cols.length > 1)
  ) {
    // any time we were a scalar and now have more than 1x1 data switch to table view
    cardDisplay = "table";
  } else if (!card.display) {
    // if our query aggregation is "rows" then ALWAYS set the display to "table"
    cardDisplay = "table";
  }

  return cardDisplay;
};

export const QUERY_COMPLETED = "metabase/qb/QUERY_COMPLETED";
export const queryCompleted = (card, queryResults) => {
  return async (dispatch, getState) => {
    dispatch.action(QUERY_COMPLETED, {
      card,
      cardDisplay: getDisplayTypeForCard(card, queryResults),
      queryResults,
    });
  };
};

/**
 * Saves to `visualization_settings` property of a question those visualization settings that
 * 1) don't have a value yet and 2) have `persistDefault` flag enabled.
 *
 * Needed for persisting visualization columns for pulses/alerts, see #6749.
 */
const getQuestionWithDefaultVisualizationSettings = (question, series) => {
  const oldVizSettings = question.visualizationSettings();
  const newVizSettings = {
    ...oldVizSettings,
    ...getPersistableDefaultSettings(series),
  };

  // Don't update the question unnecessarily
  // (even if fields values haven't changed, updating the settings will make the question appear dirty)
  if (!_.isEqual(oldVizSettings, newVizSettings)) {
    return question.setVisualizationSettings(newVizSettings);
  } else {
    return question;
  }
};

export const QUERY_ERRORED = "metabase/qb/QUERY_ERRORED";
export const queryErrored = createThunkAction(
  QUERY_ERRORED,
  (startTime, error) => {
    return async (dispatch, getState) => {
      if (error && error.isCancelled) {
        // cancelled, do nothing
        return null;
      } else {
        return { error: error, duration: new Date() - startTime };
      }
    };
  },
);

// cancelQuery
export const CANCEL_QUERY = "metabase/qb/CANCEL_QUERY";
export const cancelQuery = createThunkAction(CANCEL_QUERY, () => {
  return async (dispatch, getState) => {
    const { qb: { uiControls, cancelQueryDeferred } } = getState();

    if (uiControls.isRunning && cancelQueryDeferred) {
      cancelQueryDeferred.resolve();
    }
  };
});

export const FOLLOW_FOREIGN_KEY = "metabase/qb/FOLLOW_FOREIGN_KEY";
export const followForeignKey = createThunkAction(FOLLOW_FOREIGN_KEY, fk => {
  return async (dispatch, getState) => {
    // TODO Atte Keinänen 6/1/17: Should use `queryResults` instead
    const { qb: { card } } = getState();
    const queryResult = getFirstQueryResult(getState());

    if (!queryResult || !fk) {
      return false;
    }

    // extract the value we will use to filter our new query
    let originValue;
    for (let i = 0; i < queryResult.data.cols.length; i++) {
      if (isPK(queryResult.data.cols[i].special_type)) {
        originValue = queryResult.data.rows[0][i];
      }
    }

    // action is on an FK column
    let newCard = startNewCard("query", card.dataset_query.database);

    newCard.dataset_query.query.source_table = fk.origin.table.id;
    newCard.dataset_query.query.aggregation = ["rows"];
    newCard.dataset_query.query.filter = [
      "AND",
      ["=", fk.origin.id, originValue],
    ];

    // run it
    dispatch(setCardAndRun(newCard));
  };
});

export const LOAD_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/LOAD_OBJECT_DETAIL_FK_REFERENCES";
export const loadObjectDetailFKReferences = createThunkAction(
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  () => {
    return async (dispatch, getState) => {
      // TODO Atte Keinänen 6/1/17: Should use `queryResults` instead
      const { qb: { card, tableForeignKeys } } = getState();
      const queryResult = getFirstQueryResult(getState());

      function getObjectDetailIdValue(data) {
        for (let i = 0; i < data.cols.length; i++) {
          let coldef = data.cols[i];
          if (isPK(coldef.special_type)) {
            return data.rows[0][i];
          }
        }
      }

      async function getFKCount(card, queryResult, fk) {
        let fkQuery = createQuery("query");
        fkQuery.database = card.dataset_query.database;
        fkQuery.query.source_table = fk.origin.table_id;
        fkQuery.query.aggregation = ["count"];
        fkQuery.query.filter = [
          "AND",
          ["=", fk.origin.id, getObjectDetailIdValue(queryResult.data)],
        ];

        let info = { status: 0, value: null };

        try {
          let result = await MetabaseApi.dataset(fkQuery);
          if (
            result &&
            result.status === "completed" &&
            result.data.rows.length > 0
          ) {
            info["value"] = result.data.rows[0][0];
          } else {
            // $FlowFixMe
            info["value"] = "Unknown";
          }
        } catch (error) {
          console.error("error getting fk count", error, fkQuery);
        } finally {
          info["status"] = 1;
        }

        return info;
      }

      // TODO: there are possible cases where running a query would not require refreshing this data, but
      // skipping that for now because it's easier to just run this each time

      // run a query on FK origin table where FK origin field = objectDetailIdValue
      let fkReferences = {};
      for (let i = 0; i < tableForeignKeys.length; i++) {
        let fk = tableForeignKeys[i],
          info = await getFKCount(card, queryResult, fk);
        fkReferences[fk.origin.id] = info;
      }

      return fkReferences;
    };
  },
);

const ADD_FIELD = "metabase/qb/ADD_FIELD";
export const addField = createThunkAction(
  ADD_FIELD,
  (field, run = true) => (dispatch, getState) => {
    const { qb: { card } } = getState();
    const queryResult = getFirstQueryResult(getState());
    if (
      card.dataset_query.type === "query" &&
      queryResult &&
      queryResult.data
    ) {
      dispatch(
        setDatasetQuery(
          {
            ...card.dataset_query,
            query: {
              ...card.dataset_query.query,
              fields: getExistingFields(card, queryResult.data.cols).concat([
                field,
              ]),
            },
          },
          true,
        ),
      );
    }
  },
);

// DEPRECATED: use metabase/entities/questions
export const ARCHIVE_QUESTION = "metabase/qb/ARCHIVE_QUESTION";
export const archiveQuestion = createThunkAction(
  ARCHIVE_QUESTION,
  (questionId, archived = true) => async (dispatch, getState) => {
    let card = getState().qb.card;

    await dispatch(Questions.actions.setArchived({ id: card.id }, archived));

    dispatch(push(Urls.collection(card.collection_id)));
  },
);

export const VIEW_NEXT_OBJECT_DETAIL = "metabase/qb/VIEW_NEXT_OBJECT_DETAIL";
export const viewNextObjectDetail = () => {
  return (dispatch, getState) => {
    const question = getQuestion(getState());
    let filter = question.query().filters()[0];

    let newFilter = ["=", filter[1], filter[2] + 1];

    dispatch.action(VIEW_NEXT_OBJECT_DETAIL);

    dispatch(
      updateQuestion(
        question
          .query()
          .updateFilter(0, newFilter)
          .question(),
      ),
    );

    dispatch(runQuestionQuery());
  };
};

export const VIEW_PREVIOUS_OBJECT_DETAIL =
  "metabase/qb/VIEW_PREVIOUS_OBJECT_DETAIL";

export const viewPreviousObjectDetail = () => {
  return (dispatch, getState) => {
    const question = getQuestion(getState());
    let filter = question.query().filters()[0];

    if (filter[2] === 1) {
      return false;
    }

    let newFilter = ["=", filter[1], filter[2] - 1];

    dispatch.action(VIEW_PREVIOUS_OBJECT_DETAIL);

    dispatch(
      updateQuestion(
        question
          .query()
          .updateFilter(0, newFilter)
          .question(),
      ),
    );

    dispatch(runQuestionQuery());
  };
};

// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const toggleDataReferenceFn = toggleDataReference;
export const onBeginEditing = beginEditing;
export const onCancelEditing = cancelEditing;
export const setQueryModeFn = setQueryMode;
export const setDatabaseFn = setQueryDatabase;
export const setSourceTableFn = setQuerySourceTable;
export const setDisplayFn = setCardVisualization;
export const onSetCardAttribute = setCardAttribute;
export const reloadCardFn = reloadCard;
export const onRestoreOriginalQuery = reloadCard;
export const onUpdateVisualizationSettings = updateCardVisualizationSettings;
export const onReplaceAllVisualizationSettings = replaceAllCardVisualizationSettings;
