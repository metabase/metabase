/*@flow weak*/
import { fetchAlertsForQuestion } from "metabase/alert/alert";

declare var ace: any;

import { createAction } from "redux-actions";
import _ from "underscore";
import { assocIn, updateIn } from "icepick";

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
import { open, shouldOpenInBlankWindow } from "metabase/lib/dom";
import * as Q_DEPRECATED from "metabase/lib/query";
import { isPK } from "metabase/lib/types";
import Utils from "metabase/lib/utils";
import { defer } from "metabase/lib/promise";
import Question from "metabase-lib/lib/Question";
import { cardIsEquivalent, cardQueryIsEquivalent } from "metabase/meta/Card";

import {
  getCard,
  getQuestion,
  getOriginalQuestion,
  getOriginalCard,
  getIsEditing,
  getTransformedSeries,
  getResultsMetadata,
  getFirstQueryResult,
  getIsPreviewing,
  getTableForeignKeys,
  getQueryBuilderMode,
  getIsShowingTemplateTagsEditor,
  getIsRunning,
} from "./selectors";

import { MetabaseApi, CardApi, UserApi } from "metabase/services";

import { parse as urlParse } from "url";
import querystring from "querystring";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import { getPersistableDefaultSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import Databases from "metabase/entities/databases";

import { getMetadata } from "metabase/selectors/metadata";
import { clearRequestState } from "metabase/redux/requests";

import type { Card } from "metabase/meta/types/Card";

type UiControls = {
  isEditing?: boolean,
  isShowingTemplateTagsEditor?: boolean,
  isShowingNewbModal?: boolean,
  queryBuilderMode?: "view" | "notebook",
  isShowingSummarySidebar?: boolean,
};

const PREVIEW_RESULT_LIMIT = 10;

const getTemplateTagCount = (question: Question) => {
  const query = question.query();
  return query instanceof NativeQuery ? query.templateTags().length : 0;
};

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

export const setQueryBuilderMode = (
  queryBuilderMode,
  { shouldUpdateUrl = true } = {},
) => async dispatch => {
  await dispatch(
    setUIControls({
      queryBuilderMode,
      isShowingChartSettingsSidebar: false,
    }),
  );
  if (shouldUpdateUrl) {
    await dispatch(updateUrl(null, { queryBuilderMode }));
  }
  if (queryBuilderMode === "notebook") {
    dispatch(cancelQuery());
  }
};

export const onEditSummary = createAction("metabase/qb/EDIT_SUMMARY");
export const onCloseSummary = createAction("metabase/qb/CLOSE_SUMMARY");
export const onAddFilter = createAction("metabase/qb/ADD_FITLER");
export const onCloseFilter = createAction("metabase/qb/CLOSE_FILTER");
export const onOpenChartSettings = createAction(
  "metabase/qb/OPEN_CHART_SETTINGS",
);
export const onCloseChartSettings = createAction(
  "metabase/qb/CLOSE_CHART_SETTINGS",
);
export const onOpenChartType = createAction("metabase/qb/OPEN_CHART_TYPE");
export const onCloseChartType = createAction("metabase/qb/CLOSE_CHART_TYPE");
export const onCloseSidebars = createAction("metabase/qb/CLOSE_SIDEBARS");

export const SET_CURRENT_STATE = "metabase/qb/SET_CURRENT_STATE";
const setCurrentState = createAction(SET_CURRENT_STATE);

function getQueryBuilderModeFromLocation(location) {
  return location.pathname.endsWith("/notebook") ? "notebook" : "view";
}

export const POP_STATE = "metabase/qb/POP_STATE";
export const popState = createThunkAction(
  POP_STATE,
  location => async (dispatch, getState) => {
    const card = getCard(getState());
    if (location.state && location.state.card) {
      if (!Utils.equals(card, location.state.card)) {
        await dispatch(setCardAndRun(location.state.card, false));
        await dispatch(setCurrentState(location.state));
      }
    }
    if (
      getQueryBuilderMode(getState()) !==
      getQueryBuilderModeFromLocation(location)
    ) {
      await dispatch(
        setQueryBuilderMode(getQueryBuilderModeFromLocation(location), {
          shouldUpdateUrl: false,
        }),
      );
    }
  },
);

const getURL = (location, { includeMode = false } = {}) =>
  // strip off trailing queryBuilderMode
  (includeMode
    ? location.pathname
    : location.pathname.replace(/\/(notebook|view)$/, "")) +
  location.search +
  location.hash;

// Logic for handling location changes, dispatched by top-level QueryBuilder component
export const locationChanged = (location, nextLocation, nextParams) => (
  dispatch,
  getState,
) => {
  if (location !== nextLocation) {
    if (nextLocation.action === "POP") {
      if (
        getURL(nextLocation, { includeMode: true }) !==
        getURL(location, { includeMode: true })
      ) {
        // the browser forward/back button was pressed
        dispatch(popState(nextLocation));
      }
    } else if (
      (nextLocation.action === "PUSH" || nextLocation.action === "REPLACE") &&
      // ignore PUSH/REPLACE with `state` because they were initiated by the `updateUrl` action
      nextLocation.state === undefined
    ) {
      // a link to a different qb url was clicked
      dispatch(initializeQB(nextLocation, nextParams));
    }
  }
};

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

export const UPDATE_URL = "metabase/qb/UPDATE_URL";
export const updateUrl = createThunkAction(
  UPDATE_URL,
  (
    card,
    { dirty, replaceState, preserveParameters = true, queryBuilderMode } = {},
  ) => (dispatch, getState) => {
    let question;
    if (!card) {
      card = getCard(getState());
      question = getQuestion(getState());
    } else {
      question = new Question(getMetadata(getState()), card);
    }
    if (dirty == undefined) {
      const originalQuestion = getOriginalQuestion(getState());
      dirty =
        !originalQuestion ||
        (originalQuestion && question.isDirtyComparedTo(originalQuestion));
    }

    if (!queryBuilderMode) {
      queryBuilderMode = getQueryBuilderMode(getState());
    }

    const copy = cleanCopyCard(card);

    const newState = {
      card: copy,
      cardId: copy.id,
      serializedCard: serializeCardForUrl(copy),
    };

    const { currentState } = getState().qb;
    const url = urlForCardState(newState, dirty);

    const urlParsed = urlParse(url);
    const locationDescriptor = {
      pathname:
        (urlParsed.pathname || "") +
        (queryBuilderMode === "view" ? "" : "/" + queryBuilderMode),
      search: preserveParameters ? window.location.search : "",
      hash: urlParsed.hash,
      state: newState,
    };

    const isSameURL =
      locationDescriptor.pathname === window.location.pathname &&
      (locationDescriptor.search || "") === (window.location.search || "") &&
      (locationDescriptor.hash || "") === (window.location.hash || "");
    const isSameCard =
      currentState && currentState.serializedCard === newState.serializedCard;
    const isSameMode =
      getQueryBuilderModeFromLocation(locationDescriptor) ===
      getQueryBuilderModeFromLocation(window.location);

    if (isSameCard && isSameURL) {
      return;
    }

    if (replaceState == undefined) {
      // if the serialized card is identical replace the previous state instead of adding a new one
      // e.x. when saving a new card we want to replace the state and URL with one with the new card ID
      replaceState = isSameCard && isSameMode;
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

    let card, originalCard;
    const uiControls: UiControls = {
      isEditing: false,
      isShowingTemplateTagsEditor: false,
      queryBuilderMode: getQueryBuilderModeFromLocation(location),
    };

    // always start the QB by loading up the databases for the application
    try {
      await dispatch(
        Databases.actions.fetchList({
          include_tables: true,
          include_cards: true,
        }),
      );
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
      const hash = location.hash.replace(/^#/, "");
      if (hash.charAt(0) === "?") {
        options = querystring.parse(hash.substring(1));
      } else {
        serializedCard = hash;
      }
    }

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
      if (card.dataset_query.query) {
        if (options.table != undefined) {
          card.dataset_query.query["source-table"] = parseInt(options.table);
        }
        if (options.segment != undefined) {
          card.dataset_query.query.filter = [
            "segment",
            parseInt(options.segment),
          ];
        }
        if (options.metric != undefined) {
          // show the summarize sidebar for metrics
          uiControls.isShowingSummarySidebar = true;
          card.dataset_query.query.aggregation = [
            "metric",
            parseInt(options.metric),
          ];
        }
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
    // but don't bother for "notebook" mode
    if (question && uiControls.queryBuilderMode !== "notebook") {
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
      dispatch(
        updateUrl(card, {
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

export const setIsPreviewing = isPreviewing => ({
  type: SET_UI_CONTROLS,
  payload: { isPreviewing },
});

export const setIsNativeEditorOpen = isNativeEditorOpen => ({
  type: SET_UI_CONTROLS,
  payload: { isNativeEditorOpen },
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

// TODO Atte Keinänen 6/8/17: Could (should?) use the stored question by default instead of always requiring the explicit `card` parameter
export const LOAD_METADATA_FOR_CARD = "metabase/qb/LOAD_METADATA_FOR_CARD";
export const loadMetadataForCard = createThunkAction(
  LOAD_METADATA_FOR_CARD,
  card => {
    return async (dispatch, getState) => {
      // Short-circuit if we're in a weird state where the card isn't completely loaded
      if (!card || !card.dataset_query) {
        return;
      }
      const query = new Question(getMetadata(getState()), card).query();
      if (query instanceof StructuredQuery) {
        try {
          const rootTable = query.rootTable();
          if (rootTable) {
            await Promise.all([
              dispatch(Tables.actions.fetchTableMetadata(rootTable)),
              dispatch(Tables.actions.fetchForeignKeys(rootTable)),
            ]);
          }
          await Promise.all(
            query
              .dependentTableIds()
              .map(id => dispatch(Tables.actions.fetchMetadata({ id }))),
          );
        } catch (e) {
          console.error("Error loading metadata for card", e);
          throw e;
        }
      }
    };
  },
);

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

export const updateCardVisualizationSettings = settings => async (
  dispatch,
  getState,
) => {
  const question = getQuestion(getState());
  await dispatch(
    updateQuestion(question.updateSettings(settings), { run: "auto" }),
  );
  dispatch(updateUrl(null, { dirty: true }));
};

export const replaceAllCardVisualizationSettings = settings => async (
  dispatch,
  getState,
) => {
  const question = getQuestion(getState());
  await dispatch(
    updateQuestion(question.setSettings(settings), { run: "auto" }),
  );
  dispatch(updateUrl(null, { dirty: true }));
};

export const UPDATE_TEMPLATE_TAG = "metabase/qb/UPDATE_TEMPLATE_TAG";
export const updateTemplateTag = createThunkAction(
  UPDATE_TEMPLATE_TAG,
  templateTag => {
    return (dispatch, getState) => {
      const {
        qb: { card, uiControls },
      } = getState();

      const updatedCard = Utils.copy(card);

      // when the query changes on saved card we change this into a new query w/ a known starting point
      if (!uiControls.isEditing && updatedCard.id) {
        delete updatedCard.id;
        delete updatedCard.name;
        delete updatedCard.description;
      }

      // using updateIn instead of assocIn due to not preserving order of keys
      return updateIn(
        updatedCard,
        ["dataset_query", "native", "template-tags"],
        tags => ({ ...tags, [templateTag.name]: templateTag }),
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
    const card = Utils.copy(getOriginalCard(getState()));

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
        const card = getCardAfterVisualizationClick(nextCard, previousCard);
        const url = Urls.question(null, card);
        if (shouldOpenInBlankWindow(url, { blankOnMetaKey: true })) {
          open(url);
        } else {
          dispatch(onCloseSidebars());
          if (!cardQueryIsEquivalent(previousCard, nextCard)) {
            // clear the query result so we don't try to display the new visualization before running the new query
            dispatch(clearQueryResult());
          }
          dispatch(setCardAndRun(card));
        }
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
export const updateQuestion = (
  newQuestion,
  { doNotClearNameAndId = false, run = false } = {},
) => {
  return async (dispatch, getState) => {
    const oldQuestion = getQuestion(getState());

    // TODO Atte Keinänen 6/2/2017 Ways to have this happen automatically when modifying a question?
    // Maybe the Question class or a QB-specific question wrapper class should know whether it's being edited or not?
    if (
      !doNotClearNameAndId &&
      !getIsEditing(getState()) &&
      newQuestion.isSaved()
    ) {
      newQuestion = newQuestion.withoutNameAndId();
    }

    newQuestion = newQuestion.syncColumnsAndSettings(oldQuestion);

    if (run === "auto") {
      const queryResult = getFirstQueryResult(getState());
      run = hasNewColumns(newQuestion, queryResult);
    }

    if (!newQuestion.canAutoRun()) {
      run = false;
    }

    // Replace the current question with a new one
    await dispatch.action(UPDATE_QUESTION, { card: newQuestion.card() });

    // See if the template tags editor should be shown/hidden
    const oldTagCount = getTemplateTagCount(oldQuestion);
    const newTagCount = getTemplateTagCount(newQuestion);
    if (newTagCount > oldTagCount) {
      dispatch(setIsShowingTemplateTagsEditor(true));
    } else if (
      newTagCount === 0 &&
      getIsShowingTemplateTagsEditor(getState())
    ) {
      dispatch(setIsShowingTemplateTagsEditor(false));
    }

    try {
      if (
        !_.isEqual(
          oldQuestion.query().dependentTableIds(),
          newQuestion.query().dependentTableIds(),
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
    }

    // run updated query
    if (run) {
      dispatch(runQuestionQuery());
    }
  };
};

// DEPRECATED, still used in a couple places
export const setDatasetQuery = (datasetQuery, options) => (
  dispatch,
  getState,
) => {
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

    const resultsMetadata = getResultsMetadata(getState());
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

    let question: Question = overrideWithCard
      ? questionFromCard(overrideWithCard)
      : getQuestion(getState());
    const originalQuestion: ?Question = getOriginalQuestion(getState());

    const cardIsDirty = originalQuestion
      ? question.isDirtyComparedTo(originalQuestion)
      : true;

    if (shouldUpdateUrl) {
      dispatch(updateUrl(question.card(), { dirty: cardIsDirty }));
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

    question
      .apiGetResults({
        cancelDeferred: cancelQueryDeferred,
        ignoreCache: ignoreCache,
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

const getDisplayTypeForCard = (card, queryResults) => {
  // TODO Atte Keinänen 6/1/17: Make a holistic decision based on all queryResults, not just one
  // This method seems to has been a candidate for a rewrite anyway
  const queryResult = queryResults[0];

  let cardDisplay = card.display;

  // try a little logic to pick a smart display for the data
  // TODO: less hard-coded rules for picking chart type
  const isScalarVisualization =
    card.display === "scalar" ||
    card.display === "progress" ||
    card.display === "gauge";
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
export const cancelQuery = () => (dispatch, getState) => {
  const isRunning = getIsRunning(getState());
  if (isRunning) {
    const { cancelQueryDeferred } = getState().qb;
    if (cancelQueryDeferred) {
      cancelQueryDeferred.resolve();
    }
    return { type: CANCEL_QUERY };
  }
};

export const FOLLOW_FOREIGN_KEY = "metabase/qb/FOLLOW_FOREIGN_KEY";
export const followForeignKey = createThunkAction(FOLLOW_FOREIGN_KEY, fk => {
  return async (dispatch, getState) => {
    // TODO Atte Keinänen 6/1/17: Should use `queryResults` instead
    const {
      qb: { card },
    } = getState();
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
    const newCard = startNewCard("query", card.dataset_query.database);

    newCard.dataset_query.query["source-table"] = fk.origin.table.id;
    newCard.dataset_query.query.aggregation = ["rows"];
    newCard.dataset_query.query.filter = [
      "and",
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
      dispatch.action(CLEAR_OBJECT_DETAIL_FK_REFERENCES);
      // TODO Atte Keinänen 6/1/17: Should use `queryResults` instead
      const {
        qb: { card },
      } = getState();
      const queryResult = getFirstQueryResult(getState());
      const tableForeignKeys = getTableForeignKeys(getState());

      function getObjectDetailIdValue(data) {
        for (let i = 0; i < data.cols.length; i++) {
          const coldef = data.cols[i];
          if (isPK(coldef.special_type)) {
            return data.rows[0][i];
          }
        }
      }

      async function getFKCount(card, queryResult, fk) {
        const fkQuery = Q_DEPRECATED.createQuery("query");
        fkQuery.database = card.dataset_query.database;
        fkQuery.query["source-table"] = fk.origin.table_id;
        fkQuery.query.aggregation = ["count"];
        fkQuery.query.filter = [
          "and",
          ["=", fk.origin.id, getObjectDetailIdValue(queryResult.data)],
        ];

        const info = { status: 0, value: null };

        try {
          const result = await MetabaseApi.dataset(fkQuery);
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
      const fkReferences = {};
      for (let i = 0; i < tableForeignKeys.length; i++) {
        const fk = tableForeignKeys[i];
        const info = await getFKCount(card, queryResult, fk);
        fkReferences[fk.origin.id] = info;
      }

      // It's possible that while we were running those queries, the object
      // detail id changed. If so, these fk reference are stale and we shouldn't
      // put them in state.
      const updatedQueryResult = getFirstQueryResult(getState());
      if (
        getObjectDetailIdValue(queryResult.data) !==
        getObjectDetailIdValue(updatedQueryResult.data)
      ) {
        return null;
      }
      return fkReferences;
    };
  },
);

export const CLEAR_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/CLEAR_OBJECT_DETAIL_FK_REFERENCES";

// DEPRECATED: use metabase/entities/questions
export const ARCHIVE_QUESTION = "metabase/qb/ARCHIVE_QUESTION";
export const archiveQuestion = createThunkAction(
  ARCHIVE_QUESTION,
  (questionId, archived = true) => async (dispatch, getState) => {
    const card = getState().qb.card;

    await dispatch(Questions.actions.setArchived({ id: card.id }, archived));

    dispatch(push(Urls.collection(card.collection_id)));
  },
);

export const VIEW_NEXT_OBJECT_DETAIL = "metabase/qb/VIEW_NEXT_OBJECT_DETAIL";
export const viewNextObjectDetail = () => {
  return (dispatch, getState) => {
    const question = getQuestion(getState());
    const filter = question.query().filters()[0];

    const newFilter = ["=", filter[1], filter[2] + 1];

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
    const filter = question.query().filters()[0];

    if (filter[2] === 1) {
      return false;
    }

    const newFilter = ["=", filter[1], filter[2] - 1];

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

export const SHOW_CHART_SETTINGS = "metabase/query_builder/SHOW_CHART_SETTINGS";
export const showChartSettings = createAction(SHOW_CHART_SETTINGS);

// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const onUpdateVisualizationSettings = updateCardVisualizationSettings;
export const onReplaceAllVisualizationSettings = replaceAllCardVisualizationSettings;
