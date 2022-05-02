import { fetchAlertsForQuestion } from "metabase/alert/alert";

/*global ace*/
import { createAction } from "redux-actions";
import _ from "underscore";
import { assocIn, getIn, merge, updateIn } from "icepick";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import { createThunkAction } from "metabase/lib/redux";
import { push, replace } from "react-router-redux";
import { openUrl, setErrorPage } from "metabase/redux/app";
import { loadMetadataForQueries } from "metabase/redux/metadata";
import { addUndo } from "metabase/redux/undo";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { startTimer } from "metabase/lib/performance";
import {
  cleanCopyCard,
  deserializeCardFromUrl,
  loadCard,
  serializeCardForUrl,
  startNewCard,
} from "metabase/lib/card";
import { shouldOpenInBlankWindow } from "metabase/lib/dom";
import * as Q_DEPRECATED from "metabase/lib/query";
import { isLocalField, isSameField } from "metabase/lib/query/field_ref";
import { isAdHocModelQuestion } from "metabase/lib/data-modeling/utils";
import Utils from "metabase/lib/utils";
import { defer } from "metabase/lib/promise";

import Question from "metabase-lib/lib/Question";
import { FieldDimension } from "metabase-lib/lib/Dimension";
import { cardIsEquivalent, cardQueryIsEquivalent } from "metabase/meta/Card";
import { getValueAndFieldIdPopulatedParametersFromCard } from "metabase/parameters/utils/cards";
import { hasMatchingParameters } from "metabase/parameters/utils/dashboards";

import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import { normalize } from "cljs/metabase.mbql.js";

import {
  getCard,
  getDatasetEditorTab,
  getFirstQueryResult,
  getIsEditing,
  getIsPreviewing,
  getIsRunning,
  getIsShowingTemplateTagsEditor,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getNextRowPKValue,
  getOriginalCard,
  getOriginalQuestion,
  getPreviousQueryBuilderMode,
  getPreviousRowPKValue,
  getQueryBuilderMode,
  getQueryResults,
  getQuestion,
  getRawSeries,
  getResultsMetadata,
  getSnippetCollectionId,
  getTableForeignKeys,
  getFetchedTimelines,
  getTransformedSeries,
  getZoomedObjectId,
  isBasedOnExistingQuestion,
  getTimeoutId,
} from "./selectors";
import { trackNewQuestionSaved } from "./analytics";

import { CardApi, DashboardApi, MetabaseApi, UserApi } from "metabase/services";

import { parse as urlParse } from "url";
import querystring from "querystring";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { getSensibleDisplays } from "metabase/visualizations";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import { getPersistableDefaultSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import Snippets from "metabase/entities/snippets";

import { getMetadata } from "metabase/selectors/metadata";
import { setRequestUnloaded } from "metabase/redux/requests";

import {
  getCurrentQueryParams,
  getNextTemplateTagVisibilityState,
  getPathNameFromQueryBuilderMode,
  getQueryBuilderModeFromLocation,
  getURLForCardState,
} from "./utils";

const PREVIEW_RESULT_LIMIT = 10;

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

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

export const setQueryBuilderMode = (
  queryBuilderMode,
  { shouldUpdateUrl = true, datasetEditorTab = "query" } = {},
) => async dispatch => {
  await dispatch(
    setUIControls({
      queryBuilderMode,
      datasetEditorTab,
      isShowingChartSettingsSidebar: false,
    }),
  );
  if (shouldUpdateUrl) {
    await dispatch(updateUrl(null, { queryBuilderMode, datasetEditorTab }));
  }
  if (queryBuilderMode === "notebook") {
    dispatch(cancelQuery());
  }
  if (queryBuilderMode === "dataset") {
    dispatch(runQuestionQuery());
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
export const onOpenQuestionDetails = createAction(
  "metabase/qb/OPEN_QUESTION_DETAILS",
);
export const onCloseQuestionDetails = createAction(
  "metabase/qb/CLOSE_QUESTION_DETAILS",
);
export const onOpenQuestionHistory = createAction(
  "metabase/qb/OPEN_QUESTION_HISTORY",
);
export const onCloseQuestionHistory = createAction(
  "metabase/qb/CLOSE_QUESTION_HISTORY",
);

export const onOpenTimelines = createAction("metabase/qb/OPEN_TIMELINES");
export const onCloseTimelines = createAction("metabase/qb/CLOSE_TIMELINES");

export const onCloseChartType = createAction("metabase/qb/CLOSE_CHART_TYPE");
export const onCloseSidebars = createAction("metabase/qb/CLOSE_SIDEBARS");

export const SET_CURRENT_STATE = "metabase/qb/SET_CURRENT_STATE";
const setCurrentState = createAction(SET_CURRENT_STATE);

export const POP_STATE = "metabase/qb/POP_STATE";
export const popState = createThunkAction(
  POP_STATE,
  location => async (dispatch, getState) => {
    dispatch(cancelQuery());

    const zoomedObjectId = getZoomedObjectId(getState());
    if (zoomedObjectId) {
      const { locationBeforeTransitions = {} } = getState().routing;
      const { state, query } = locationBeforeTransitions;
      const previouslyZoomedObjectId = state?.objectId || query?.objectId;

      if (
        previouslyZoomedObjectId &&
        zoomedObjectId !== previouslyZoomedObjectId
      ) {
        dispatch(zoomInRow({ objectId: previouslyZoomedObjectId }));
      } else {
        dispatch(resetRowZoom());
      }
      return;
    }

    const card = getCard(getState());
    if (location.state && location.state.card) {
      if (!Utils.equals(card, location.state.card)) {
        const shouldRefreshUrl = location.state.card.dataset;
        await dispatch(setCardAndRun(location.state.card, shouldRefreshUrl));
        await dispatch(setCurrentState(location.state));
      }
    }

    const {
      mode: queryBuilderModeFromURL,
      ...uiControls
    } = getQueryBuilderModeFromLocation(location);

    if (getQueryBuilderMode(getState()) !== queryBuilderModeFromURL) {
      await dispatch(
        setQueryBuilderMode(queryBuilderModeFromURL, {
          ...uiControls,
          shouldUpdateUrl: queryBuilderModeFromURL === "dataset",
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
    {
      dirty,
      replaceState,
      preserveParameters = true,
      queryBuilderMode,
      datasetEditorTab,
      objectId,
    } = {},
  ) => (dispatch, getState) => {
    let question;
    if (!card) {
      card = getCard(getState());
      question = getQuestion(getState());
    } else {
      question = new Question(card, getMetadata(getState()));
    }

    if (dirty == null) {
      const originalQuestion = getOriginalQuestion(getState());
      const isAdHocModel = isAdHocModelQuestion(question, originalQuestion);
      dirty =
        !originalQuestion ||
        (!isAdHocModel && question.isDirtyComparedTo(originalQuestion));
    }

    // prevent clobbering of hash when there are fake parameters on the question
    // consider handling this in a more general way, somehow
    if (question.isStructured() && question.parameters().length > 0) {
      dirty = true;
    }

    if (!queryBuilderMode) {
      queryBuilderMode = getQueryBuilderMode(getState());
    }
    if (!datasetEditorTab) {
      datasetEditorTab = getDatasetEditorTab(getState());
    }

    const copy = cleanCopyCard(card);

    const newState = {
      card: copy,
      cardId: copy.id,
      serializedCard: serializeCardForUrl(copy),
      objectId,
    };

    const { currentState } = getState().qb;
    const queryParams = preserveParameters ? getCurrentQueryParams() : {};
    const url = getURLForCardState(newState, dirty, queryParams, objectId);

    const urlParsed = urlParse(url);
    const locationDescriptor = {
      pathname: getPathNameFromQueryBuilderMode({
        pathname: urlParsed.pathname || "",
        queryBuilderMode,
        datasetEditorTab,
      }),
      search: urlParsed.search,
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
      getQueryBuilderModeFromLocation(locationDescriptor).mode ===
      getQueryBuilderModeFromLocation(window.location).mode;

    if (isSameCard && isSameURL) {
      return;
    }

    if (replaceState == null) {
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

async function verifyMatchingDashcardAndParameters({
  dispatch,
  dashboardId,
  dashcardId,
  cardId,
  parameters,
  metadata,
}) {
  try {
    const dashboard = await DashboardApi.get({ dashId: dashboardId });
    if (
      !hasMatchingParameters({
        dashboard,
        dashcardId,
        cardId,
        parameters,
        metadata,
      })
    ) {
      dispatch(setErrorPage({ status: 403 }));
    }
  } catch (error) {
    dispatch(setErrorPage(error));
  }
}

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const initializeQB = (location, params) => {
  return async (dispatch, getState) => {
    const queryParams = location.query;
    // do this immediately to ensure old state is cleared before the user sees it
    dispatch(resetQB());
    dispatch(cancelQuery());

    const { currentUser } = getState();

    const cardId = Urls.extractEntityId(params.slug);
    let card, originalCard;

    const {
      mode: queryBuilderMode,
      ...otherUiControls
    } = getQueryBuilderModeFromLocation(location);
    const uiControls = {
      isEditing: false,
      isShowingTemplateTagsEditor: false,
      queryBuilderMode,
      ...otherUiControls,
    };

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
    let snippetFetch;
    if (cardId || serializedCard) {
      // existing card being loaded
      try {
        // if we have a serialized card then unpack and use it
        if (serializedCard) {
          card = deserializeCardFromUrl(serializedCard);
          // if serialized query has database we normalize syntax to support older mbql
          if (card.dataset_query.database != null) {
            card.dataset_query = normalize(card.dataset_query);
          }
        } else {
          card = {};
        }

        const deserializedCard = card;

        // load the card either from `cardId` parameter or the serialized card
        if (cardId) {
          card = await loadCard(cardId);
          // when we are loading from a card id we want an explicit clone of the card we loaded which is unmodified
          originalCard = Utils.copy(card);
          // for showing the "started from" lineage correctly when adding filters/breakouts and when going back and forth
          // in browser history, the original_card_id has to be set for the current card (simply the id of card itself for now)
          card.original_card_id = card.id;

          // if there's a card in the url, it may have parameters from a dashboard
          if (deserializedCard && deserializedCard.parameters) {
            const metadata = getMetadata(getState());
            const { dashboardId, dashcardId, parameters } = deserializedCard;
            verifyMatchingDashcardAndParameters({
              dispatch,
              dashboardId,
              dashcardId,
              cardId,
              parameters,
              metadata,
            });

            card.parameters = parameters;
            card.dashboardId = dashboardId;
            card.dashcardId = dashcardId;
          }
        } else if (card.original_card_id) {
          const deserializedCard = card;
          // deserialized card contains the card id, so just populate originalCard
          originalCard = await loadCard(card.original_card_id);

          if (cardIsEquivalent(deserializedCard, originalCard)) {
            card = Utils.copy(originalCard);

            if (
              !cardIsEquivalent(deserializedCard, originalCard, {
                checkParameters: true,
              })
            ) {
              const metadata = getMetadata(getState());
              const { dashboardId, dashcardId, parameters } = deserializedCard;
              verifyMatchingDashcardAndParameters({
                dispatch,
                dashboardId,
                dashcardId,
                cardId: card.id,
                parameters,
                metadata,
              });

              card.parameters = parameters;
              card.dashboardId = dashboardId;
              card.dashcardId = dashcardId;
            }
          }
        }
        // if this card has any snippet tags we might need to fetch snippets pending permissions
        if (
          Object.values(
            getIn(card, ["dataset_query", "native", "template-tags"]) || {},
          ).filter(t => t.type === "snippet").length > 0
        ) {
          const dbId = card.database_id;
          let database = Databases.selectors.getObject(getState(), {
            entityId: dbId,
          });
          // if we haven't already loaded this database, block on loading dbs now so we can check write permissions
          if (!database) {
            await dispatch(Databases.actions.fetchList());
            database = Databases.selectors.getObject(getState(), {
              entityId: dbId,
            });
          }

          // database could still be missing if the user doesn't have any permissions
          // if the user has native permissions against this db, fetch snippets
          if (database && database.native_permissions === "write") {
            snippetFetch = dispatch(Snippets.actions.fetchList());
          }
        }

        MetabaseAnalytics.trackStructEvent(
          "QueryBuilder",
          "Query Loaded",
          card.dataset_query.type,
        );

        // if we have deserialized card from the url AND loaded a card by id then the user should be dropped into edit mode
        uiControls.isEditing = !!options.edit;

        // if this is the users first time loading a saved card on the QB then show them the newb modal
        if (cardId && currentUser.is_qbnewb) {
          uiControls.isShowingNewbModal = true;
          MetabaseAnalytics.trackStructEvent("QueryBuilder", "Show Newb Modal");
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

        if (!card.dataset && location.pathname.startsWith("/model")) {
          dispatch(
            setErrorPage({
              data: {
                error_code: "not-found",
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
        if (options.table != null) {
          card.dataset_query.query["source-table"] = parseInt(options.table);
        }
        if (options.segment != null) {
          card.dataset_query.query.filter = [
            "segment",
            parseInt(options.segment),
          ];
        }
        if (options.metric != null) {
          // show the summarize sidebar for metrics
          uiControls.isShowingSummarySidebar = true;
          card.dataset_query.query.aggregation = [
            "metric",
            parseInt(options.metric),
          ];
        }
      }

      MetabaseAnalytics.trackStructEvent(
        "QueryBuilder",
        "Query Started",
        card.dataset_query.type,
      );
    }

    /**** All actions are dispatched here ****/

    // Fetch alerts for the current question if the question is saved
    if (card && card.id != null) {
      dispatch(fetchAlertsForQuestion(card.id));
    }
    // Fetch the question metadata (blocking)
    if (card) {
      await dispatch(loadMetadataForCard(card));
    }

    let question = card && new Question(card, getMetadata(getState()));
    if (question && question.isSaved()) {
      // loading a saved question prevents auto-viz selection
      question = question.lockDisplay();
    }

    if (question && question.isNative() && snippetFetch) {
      await snippetFetch;
      const snippets = Snippets.selectors.getList(getState());
      question = question.setQuery(
        question.query().updateQueryTextWithNewSnippetNames(snippets),
      );
    }

    card = question && question.card();
    const metadata = getMetadata(getState());
    const parameters = getValueAndFieldIdPopulatedParametersFromCard(
      card,
      metadata,
    );
    const parameterValues = getParameterValuesByIdFromQueryParams(
      parameters,
      queryParams,
      metadata,
    );

    const objectId = params?.objectId || queryParams?.objectId;

    // Update the question to Redux state together with the initial state of UI controls
    dispatch.action(INITIALIZE_QB, {
      card,
      originalCard,
      uiControls,
      parameterValues,
      objectId,
    });

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
          objectId,
        }),
      );
    }
  };
};

export const TOGGLE_DATA_REFERENCE = "metabase/qb/TOGGLE_DATA_REFERENCE";
export const toggleDataReference = createAction(TOGGLE_DATA_REFERENCE, () => {
  MetabaseAnalytics.trackStructEvent("QueryBuilder", "Toggle Data Reference");
});

export const TOGGLE_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/TOGGLE_TEMPLATE_TAGS_EDITOR";
export const toggleTemplateTagsEditor = createAction(
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  () => {
    MetabaseAnalytics.trackStructEvent(
      "QueryBuilder",
      "Toggle Template Tags Editor",
    );
  },
);

export const SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR";
export const setIsShowingTemplateTagsEditor = isShowingTemplateTagsEditor => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});

export const TOGGLE_SNIPPET_SIDEBAR = "metabase/qb/TOGGLE_SNIPPET_SIDEBAR";
export const toggleSnippetSidebar = createAction(TOGGLE_SNIPPET_SIDEBAR, () => {
  MetabaseAnalytics.trackStructEvent("QueryBuilder", "Toggle Snippet Sidebar");
});

export const SET_IS_SHOWING_SNIPPET_SIDEBAR =
  "metabase/qb/SET_IS_SHOWING_SNIPPET_SIDEBAR";
export const setIsShowingSnippetSidebar = isShowingSnippetSidebar => ({
  type: SET_IS_SHOWING_SNIPPET_SIDEBAR,
  isShowingSnippetSidebar,
});

export const setIsPreviewing = isPreviewing => ({
  type: SET_UI_CONTROLS,
  payload: { isPreviewing },
});

export const setIsNativeEditorOpen = isNativeEditorOpen => ({
  type: SET_UI_CONTROLS,
  payload: { isNativeEditorOpen },
});

export const SET_NATIVE_EDITOR_SELECTED_RANGE =
  "metabase/qb/SET_NATIVE_EDITOR_SELECTED_RANGE";
export const setNativeEditorSelectedRange = createAction(
  SET_NATIVE_EDITOR_SELECTED_RANGE,
);

export const SET_MODAL_SNIPPET = "metabase/qb/SET_MODAL_SNIPPET";
export const setModalSnippet = createAction(SET_MODAL_SNIPPET);

export const SET_SNIPPET_COLLECTION_ID =
  "metabase/qb/SET_SNIPPET_COLLECTION_ID";
export const setSnippetCollectionId = createAction(SET_SNIPPET_COLLECTION_ID);

export const openSnippetModalWithSelectedText = () => (dispatch, getState) => {
  const state = getState();
  const content = getNativeEditorSelectedText(state);
  const collection_id = getSnippetCollectionId(state);
  dispatch(setModalSnippet({ content, collection_id }));
};

export const closeSnippetModal = () => (dispatch, getState) => {
  dispatch(setModalSnippet(null));
};

export const insertSnippet = snip => (dispatch, getState) => {
  const name = snip.name;
  const question = getQuestion(getState());
  const query = question.query();
  const nativeEditorCursorOffset = getNativeEditorCursorOffset(getState());
  const nativeEditorSelectedText = getNativeEditorSelectedText(getState());
  const selectionStart =
    nativeEditorCursorOffset - (nativeEditorSelectedText || "").length;
  const newText =
    query.queryText().slice(0, selectionStart) +
    `{{snippet: ${name}}}` +
    query.queryText().slice(nativeEditorCursorOffset);
  const datasetQuery = query
    .setQueryText(newText)
    .updateSnippetsWithIds([snip])
    .datasetQuery();
  dispatch(updateQuestion(question.setDatasetQuery(datasetQuery)));
};

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (dispatch, getState) => {
    // persist the fact that this user has seen the NewbModal
    const { currentUser } = getState();
    await UserApi.update_qbnewb({ id: currentUser.id });
    MetabaseAnalytics.trackStructEvent("QueryBuilder", "Close Newb Modal");
  };
});

export const loadMetadataForCard = card => (dispatch, getState) => {
  const metadata = getMetadata(getState());
  const question = new Question(card, metadata);
  const queries = [question.query()];
  if (question.isDataset()) {
    queries.push(question.composeDataset().query());
  }
  return dispatch(
    loadMetadataForQueries(queries, question.dependentMetadata()),
  );
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

export const updateCardVisualizationSettings = settings => async (
  dispatch,
  getState,
) => {
  const question = getQuestion(getState());
  const previousQueryBuilderMode = getPreviousQueryBuilderMode(getState());
  const queryBuilderMode = getQueryBuilderMode(getState());
  const datasetEditorTab = getDatasetEditorTab(getState());
  const isEditingDatasetMetadata =
    queryBuilderMode === "dataset" && datasetEditorTab === "metadata";
  const wasJustEditingModel =
    previousQueryBuilderMode === "dataset" && queryBuilderMode !== "dataset";
  const changedSettings = Object.keys(settings);
  const isColumnWidthResetEvent =
    changedSettings.length === 1 &&
    changedSettings.includes("table.column_widths") &&
    settings["table.column_widths"] === undefined;

  if (
    (isEditingDatasetMetadata || wasJustEditingModel) &&
    isColumnWidthResetEvent
  ) {
    return;
  }

  // The check allows users without data permission to resize/rearrange columns
  const hasWritePermissions = question.query().isEditable();
  await dispatch(
    updateQuestion(question.updateSettings(settings), {
      run: hasWritePermissions ? "auto" : false,
      shouldUpdateUrl: hasWritePermissions,
    }),
  );
};

export const replaceAllCardVisualizationSettings = settings => async (
  dispatch,
  getState,
) => {
  const question = getQuestion(getState());

  // The check allows users without data permission to resize/rearrange columns
  const hasWritePermissions = question.query().isEditable();
  await dispatch(
    updateQuestion(question.setSettings(settings), {
      run: hasWritePermissions ? "auto" : false,
      shouldUpdateUrl: hasWritePermissions,
    }),
  );
};

export const SET_TEMPLATE_TAG = "metabase/qb/SET_TEMPLATE_TAG";
export const setTemplateTag = createThunkAction(
  SET_TEMPLATE_TAG,
  templateTag => {
    return (dispatch, getState) => {
      const {
        qb: { card, uiControls },
      } = getState();

      const updatedCard = Utils.copy(card);

      // when the query changes on saved card we change this into a new query w/ a known starting point
      if (
        !uiControls.isEditing &&
        uiControls.queryBuilderMode !== "dataset" &&
        updatedCard.id
      ) {
        delete updatedCard.id;
        delete updatedCard.name;
        delete updatedCard.description;
      }

      // we need to preserve the order of the keys to avoid UI jumps
      return updateIn(
        updatedCard,
        ["dataset_query", "native", "template-tags"],
        tags => {
          const { name } = templateTag;
          const newTag =
            tags[name] && tags[name].type !== templateTag.type
              ? // when we switch type, null out any default
                { ...templateTag, default: null }
              : templateTag;
          return { ...tags, [name]: newTag };
        },
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

// refetches the card without triggering a run of the card's query
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
  { run = false, shouldUpdateUrl = false } = {},
) => {
  return async (dispatch, getState) => {
    const oldQuestion = getQuestion(getState());
    const mode = getQueryBuilderMode(getState());

    const shouldConvertIntoAdHoc = newQuestion.query().isEditable();

    // TODO Atte Keinänen 6/2/2017 Ways to have this happen automatically when modifying a question?
    // Maybe the Question class or a QB-specific question wrapper class should know whether it's being edited or not?
    if (
      shouldConvertIntoAdHoc &&
      !getIsEditing(getState()) &&
      newQuestion.isSaved() &&
      mode !== "dataset"
    ) {
      newQuestion = newQuestion.withoutNameAndId();

      // When the dataset query changes, we should loose the dataset flag,
      // to start building a new ad-hoc question based on a dataset
      if (newQuestion.isDataset()) {
        newQuestion = newQuestion.setDataset(false);
        dispatch(onCloseQuestionDetails());
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
      await dispatch(loadMetadataForCard(question.card()));
      dispatch(runQuestionQuery());
    }
  };
};

/**
 * Queries the result for the currently active question or alternatively for the card provided in `overrideWithCard`.
 * The API queries triggered by this action creator can be cancelled using the deferred provided in RUN_QUERY action.
 */
export const RUN_QUERY = "metabase/qb/RUN_QUERY";
export const runQuestionQuery = ({
  shouldUpdateUrl = true,
  ignoreCache = false,
  overrideWithCard,
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

    // TODO Move this out from Redux action asap
    // HACK: prevent SQL editor from losing focus
    try {
      ace.edit("id_sql").focus();
    } catch (e) {}

    dispatch.action(RUN_QUERY, { cancelQueryDeferred });
  };
};

const loadStartUIControls = createThunkAction(
  LOAD_START_UI_CONTROLS,
  () => (dispatch, getState) => {
    dispatch(setDocumentTitle(t`Doing Science...`));
    const timeoutId = setTimeout(() => {
      dispatch(setDocumentTitle(t`Still Here...`));
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

export const ZOOM_IN_ROW = "metabase/qb/ZOOM_IN_ROW";
export const zoomInRow = ({ objectId }) => dispatch => {
  dispatch({ type: ZOOM_IN_ROW, payload: { objectId } });
  dispatch(updateUrl(null, { objectId, replaceState: false }));
};

export const RESET_ROW_ZOOM = "metabase/qb/RESET_ROW_ZOOM";
export const resetRowZoom = () => dispatch => {
  dispatch({ type: RESET_ROW_ZOOM });
  dispatch(updateUrl());
};

function getFilterForFK(zoomedObjectId, fk) {
  const field = new FieldDimension(fk.origin.id);
  return ["=", field.mbql(), zoomedObjectId];
}

export const FOLLOW_FOREIGN_KEY = "metabase/qb/FOLLOW_FOREIGN_KEY";
export const followForeignKey = createThunkAction(
  FOLLOW_FOREIGN_KEY,
  ({ objectId, fk }) => {
    return async (dispatch, getState) => {
      const state = getState();

      const card = getCard(state);
      const queryResult = getFirstQueryResult(state);

      if (!queryResult || !fk) {
        return false;
      }

      const newCard = startNewCard("query", card.dataset_query.database);

      newCard.dataset_query.query["source-table"] = fk.origin.table.id;
      newCard.dataset_query.query.filter = getFilterForFK(objectId, fk);

      dispatch(resetRowZoom());
      dispatch(setCardAndRun(newCard));
    };
  },
);

export const LOAD_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/LOAD_OBJECT_DETAIL_FK_REFERENCES";
export const loadObjectDetailFKReferences = createThunkAction(
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  ({ objectId }) => {
    return async (dispatch, getState) => {
      dispatch.action(CLEAR_OBJECT_DETAIL_FK_REFERENCES);

      const state = getState();
      const tableForeignKeys = getTableForeignKeys(state);

      if (!Array.isArray(tableForeignKeys)) {
        return null;
      }

      const card = getCard(state);
      const queryResult = getFirstQueryResult(state);

      async function getFKCount(card, queryResult, fk) {
        const fkQuery = Q_DEPRECATED.createQuery("query");

        fkQuery.database = card.dataset_query.database;
        fkQuery.query["source-table"] = fk.origin.table_id;
        fkQuery.query.aggregation = ["count"];
        fkQuery.query.filter = getFilterForFK(objectId, fk);

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
            info["value"] = "Unknown";
          }
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
      // put them in state. The detail id is used in the query so we check that.
      const updatedQueryResult = getFirstQueryResult(getState());
      if (!_.isEqual(queryResult.json_query, updatedQueryResult.json_query)) {
        return null;
      }
      return fkReferences;
    };
  },
);

export const CLEAR_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/CLEAR_OBJECT_DETAIL_FK_REFERENCES";

export const viewNextObjectDetail = () => {
  return (dispatch, getState) => {
    const objectId = getNextRowPKValue(getState());
    if (objectId != null) {
      dispatch(zoomInRow({ objectId }));
    }
  };
};

export const viewPreviousObjectDetail = () => {
  return (dispatch, getState) => {
    const objectId = getPreviousRowPKValue(getState());
    if (objectId != null) {
      dispatch(zoomInRow({ objectId }));
    }
  };
};

export const SHOW_CHART_SETTINGS = "metabase/query_builder/SHOW_CHART_SETTINGS";
export const showChartSettings = createAction(SHOW_CHART_SETTINGS);

// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const onUpdateVisualizationSettings = updateCardVisualizationSettings;
export const onReplaceAllVisualizationSettings = replaceAllCardVisualizationSettings;

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

export const setDatasetEditorTab = datasetEditorTab => dispatch => {
  dispatch(setQueryBuilderMode("dataset", { datasetEditorTab }));
};

export const CANCEL_DATASET_CHANGES = "metabase/qb/CANCEL_DATASET_CHANGES";
export const onCancelDatasetChanges = () => (dispatch, getState) => {
  const cardBeforeChanges = getOriginalCard(getState());
  dispatch.action(CANCEL_DATASET_CHANGES, {
    card: cardBeforeChanges,
  });
  dispatch(runQuestionQuery());
};

export const turnQuestionIntoDataset = () => async (dispatch, getState) => {
  const question = getQuestion(getState());
  const dataset = question.setDataset(true);
  await dispatch(apiUpdateQuestion(dataset, { rerunQuery: true }));

  dispatch(
    addUndo({
      message: t`This is a model now.`,
      actions: [apiUpdateQuestion(question, { rerunQuery: true })],
    }),
  );
};

export const turnDatasetIntoQuestion = () => async (dispatch, getState) => {
  const dataset = getQuestion(getState());
  const question = dataset.setDataset(false);
  await dispatch(apiUpdateQuestion(question, { rerunQuery: true }));

  dispatch(
    addUndo({
      message: t`This is a question now.`,
      actions: [apiUpdateQuestion(dataset, { rerunQuery: true })],
    }),
  );
};

export const SET_RESULTS_METADATA = "metabase/qb/SET_RESULTS_METADATA";
export const setResultsMetadata = createAction(SET_RESULTS_METADATA);

export const SET_METADATA_DIFF = "metabase/qb/SET_METADATA_DIFF";
export const setMetadataDiff = createAction(SET_METADATA_DIFF);

export const setFieldMetadata = ({ field_ref, changes }) => (
  dispatch,
  getState,
) => {
  const question = getQuestion(getState());
  const resultsMetadata = getResultsMetadata(getState());

  const nextColumnMetadata = resultsMetadata.columns.map(fieldMetadata => {
    const compareExact =
      !isLocalField(field_ref) || !isLocalField(fieldMetadata.field_ref);
    const isTargetField = isSameField(
      field_ref,
      fieldMetadata.field_ref,
      compareExact,
    );
    return isTargetField ? merge(fieldMetadata, changes) : fieldMetadata;
  });

  const nextResultsMetadata = {
    ...resultsMetadata,
    columns: nextColumnMetadata,
  };

  const nextQuestion = question.setResultsMetadata(nextResultsMetadata);

  dispatch(updateQuestion(nextQuestion));
  dispatch(setMetadataDiff({ field_ref, changes }));
  dispatch(setResultsMetadata(nextResultsMetadata));
};

export const SHOW_TIMELINES = "metabase/qb/SHOW_TIMELINES";
export const showTimelines = createAction(SHOW_TIMELINES);

export const HIDE_TIMELINES = "metabase/qb/HIDE_TIMELINES";
export const hideTimelines = createAction(HIDE_TIMELINES);

export const SELECT_TIMELINE_EVENTS = "metabase/qb/SELECT_TIMELINE_EVENTS";
export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);

export const DESELECT_TIMELINE_EVENTS = "metabase/qb/DESELECT_TIMELINE_EVENTS";
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

export const showTimelinesForCollection = collectionId => (
  dispatch,
  getState,
) => {
  const fetchedTimelines = getFetchedTimelines(getState());
  const collectionTimelines = collectionId
    ? fetchedTimelines.filter(t => t.collection_id === collectionId)
    : fetchedTimelines.filter(t => t.collection_id == null);

  dispatch(showTimelines(collectionTimelines));
};
