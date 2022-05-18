/* eslint-disable react/prop-types */
import { assoc, assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

import { t } from "ttag";

import { createAction, createThunkAction } from "metabase/lib/redux";
import { defer } from "metabase/lib/promise";
import { normalize, schema } from "normalizr";

import Question from "metabase-lib/lib/Question";

import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import { openUrl } from "metabase/redux/app";
import {
  createParameter,
  setParameterName as setParamName,
  setParameterDefaultValue as setParamDefaultValue,
  getDashboardUiParameters,
  getParametersMappedToDashcard,
  getFilteringParameterValuesMap,
  getParameterValuesSearchKey,
} from "metabase/parameters/utils/dashboards";
import { applyParameters } from "metabase/meta/Card";
import {
  getParameterValuesBySlug,
  getParameterValuesByIdFromQueryParams,
} from "metabase/parameters/utils/parameter-values";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import Utils from "metabase/lib/utils";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { clickBehaviorIsValid } from "metabase/lib/click-behavior";
import { createCard } from "metabase/lib/card";

import {
  addParamValues,
  addFields,
  loadMetadataForQueries,
} from "metabase/redux/metadata";

import {
  DashboardApi,
  CardApi,
  PublicApi,
  EmbedApi,
  AutoApi,
  MetabaseApi,
  maybeUsePivotEndpoint,
} from "metabase/services";

import {
  getDashboard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getParameterValues,
  getDashboardParameterValuesSearchCache,
  getLoadingDashCards,
} from "./selectors";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";

import {
  expandInlineDashboard,
  isVirtualDashCard,
  getAllDashboardCards,
  getDashboardType,
  fetchDataOrError,
  getDatasetQueryParams,
} from "./utils";

const DATASET_SLOW_TIMEOUT = 15 * 1000;

// normalizr schemas
const dashcard = new schema.Entity("dashcard");
const dashboard = new schema.Entity("dashboard", {
  ordered_cards: [dashcard],
});

// action constants

export const INITIALIZE = "metabase/dashboard/INITIALIZE";
export const RESET = "metabase/dashboard/RESET";

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";

// NOTE: this is used in metabase/redux/metadata but can't be imported directly due to circular reference
export const FETCH_DASHBOARD = "metabase/dashboard/FETCH_DASHBOARD";
export const SAVE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/SAVE_DASHBOARD_AND_CARDS";
export const SET_DASHBOARD_ATTRIBUTES =
  "metabase/dashboard/SET_DASHBOARD_ATTRIBUTES";

export const ADD_CARD_TO_DASH = "metabase/dashboard/ADD_CARD_TO_DASH";
export const REMOVE_CARD_FROM_DASH = "metabase/dashboard/REMOVE_CARD_FROM_DASH";
export const SET_DASHCARD_ATTRIBUTES =
  "metabase/dashboard/SET_DASHCARD_ATTRIBUTES";
export const SET_MULTIPLE_DASHCARD_ATTRIBUTES =
  "metabase/dashboard/SET_MULTIPLE_DASHCARD_ATTRIBUTES";
export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS";
export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN";
export const REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS";
export const UPDATE_DASHCARD_ID = "metabase/dashboard/UPDATE_DASHCARD_ID";

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";
export const FETCH_CARD_DATA = "metabase/dashboard/FETCH_CARD_DATA";

export const CANCEL_FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_DASHBOARD_CARD_DATA";
export const CANCEL_FETCH_CARD_DATA =
  "metabase/dashboard/CANCEL_FETCH_CARD_DATA";

export const MARK_CARD_AS_SLOW = "metabase/dashboard/MARK_CARD_AS_SLOW";
export const CLEAR_CARD_DATA = "metabase/dashboard/CLEAR_CARD_DATA";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";

export const ADD_PARAMETER = "metabase/dashboard/ADD_PARAMETER";
export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const SET_PARAMETER_MAPPING = "metabase/dashboard/SET_PARAMETER_MAPPING";
export const SET_PARAMETER_NAME = "metabase/dashboard/SET_PARAMETER_NAME";
export const SET_PARAMETER_VALUE = "metabase/dashboard/SET_PARAMETER_VALUE";
export const SET_PARAMETER_INDEX = "metabase/dashboard/SET_PARAMETER_INDEX";
export const SET_PARAMETER_DEFAULT_VALUE =
  "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";

export const SHOW_ADD_PARAMETER_POPOVER =
  "metabase/dashboard/SHOW_ADD_PARAMETER_POPOVER";
export const HIDE_ADD_PARAMETER_POPOVER =
  "metabase/dashboard/HIDE_ADD_PARAMETER_POPOVER";

export const FETCH_DASHBOARD_PARAMETER_FIELD_VALUES =
  "metabase/dashboard/FETCH_DASHBOARD_PARAMETER_FIELD_VALUES";

export const SET_SIDEBAR = "metabase/dashboard/SET_SIDEBAR";
export const CLOSE_SIDEBAR = "metabase/dashboard/CLOSE_SIDEBAR";

export const SET_SHOW_LOADING_COMPLETE_FAVICON =
  "metabase/dashboard/SET_SHOW_LOADING_COMPLETE_FAVICON";
export const SET_DOCUMENT_TITLE = "metabase/dashboard/SET_DOCUMENT_TITLE";
const setDocumentTitle = createAction(SET_DOCUMENT_TITLE);

export const SET_LOADING_DASHCARDS_COMPLETE =
  "metabase/dashboard/SET_LOADING_DASHCARDS_COMPLETE";

export const initialize = createAction(INITIALIZE);
export const reset = createAction(RESET);
export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);

export const setSidebar = createAction(SET_SIDEBAR);
export const closeSidebar = createAction(CLOSE_SIDEBAR);

export const setShowLoadingCompleteFavicon = createAction(
  SET_SHOW_LOADING_COMPLETE_FAVICON,
);

export const setSharing = isSharing => dispatch => {
  if (isSharing) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.sharing,
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const showClickBehaviorSidebar = dashcardId => dispatch => {
  if (dashcardId != null) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.clickBehavior,
        props: { dashcardId },
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const setEditingParameter = parameterId => dispatch => {
  if (parameterId != null) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.editParameter,
        props: {
          parameterId,
        },
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const openAddQuestionSidebar = () => dispatch => {
  dispatch(
    setSidebar({
      name: SIDEBAR_NAME.addQuestion,
    }),
  );
};

export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);
export const showAddParameterPopover = createAction(SHOW_ADD_PARAMETER_POPOVER);
export const hideAddParameterPopover = createAction(HIDE_ADD_PARAMETER_POPOVER);
// these operations don't get saved to server immediately
export const setDashboardAttributes = createAction(SET_DASHBOARD_ATTRIBUTES);
export const setDashCardAttributes = createAction(SET_DASHCARD_ATTRIBUTES);
export const setMultipleDashCardAttributes = createAction(
  SET_MULTIPLE_DASHCARD_ATTRIBUTES,
);

function generateTemporaryDashcardId() {
  return Math.random();
}

// real dashcard ids are integers >= 1
function isNewDashcard(dashcard) {
  return dashcard.id < 1 && dashcard.id >= 0;
}

function isNewAdditionalSeriesCard(card, dashcard) {
  return (
    card.id !== dashcard.card_id && !dashcard.series.some(s => s.id === card.id)
  );
}

export const addCardToDashboard = ({ dashId, cardId }) => async (
  dispatch,
  getState,
) => {
  await dispatch(Questions.actions.fetch({ id: cardId }));
  const card = Questions.selectors.getObject(getState(), {
    entityId: cardId,
  });
  const { dashboards, dashcards } = getState().dashboard;
  const dashboard = dashboards[dashId];
  const existingCards = dashboard.ordered_cards
    .map(id => dashcards[id])
    .filter(dc => !dc.isRemoved);
  const dashcard = {
    id: generateTemporaryDashcardId(),
    dashboard_id: dashId,
    card_id: card.id,
    card: card,
    series: [],
    ...getPositionForNewDashCard(existingCards),
    parameter_mappings: [],
    visualization_settings: {},
  };
  dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
  dispatch(fetchCardData(card, dashcard, { reload: true, clear: true }));

  dispatch(loadMetadataForDashboard([dashcard]));
};

export const addDashCardToDashboard = function({ dashId, dashcardOverrides }) {
  return function(dispatch, getState) {
    const { dashboards, dashcards } = getState().dashboard;
    const dashboard = dashboards[dashId];
    const existingCards = dashboard.ordered_cards
      .map(id => dashcards[id])
      .filter(dc => !dc.isRemoved);
    const dashcard = {
      id: generateTemporaryDashcardId(),
      card_id: null,
      card: null,
      dashboard_id: dashId,
      series: [],
      ...getPositionForNewDashCard(existingCards),
      parameter_mappings: [],
      visualization_settings: {},
    };
    _.extend(dashcard, dashcardOverrides);
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
  };
};

export const addTextDashCardToDashboard = function({ dashId }) {
  const virtualTextCard = createCard();
  virtualTextCard.display = "text";
  virtualTextCard.archived = false;

  const dashcardOverrides = {
    card: virtualTextCard,
    visualization_settings: {
      virtual_card: virtualTextCard,
    },
  };
  return addDashCardToDashboard({
    dashId: dashId,
    dashcardOverrides: dashcardOverrides,
  });
};

export const saveDashboardAndCards = createThunkAction(
  SAVE_DASHBOARD_AND_CARDS,
  function() {
    return async function(dispatch, getState) {
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;
      const dashboard = {
        ...dashboards[dashboardId],
        ordered_cards: dashboards[dashboardId].ordered_cards.map(
          dashcardId => dashcards[dashcardId],
        ),
      };

      // clean invalid dashcards
      // We currently only do this for dashcard click behavior.
      // Invalid (partially complete) states are fine during editing,
      // but we should restore the previous value if saved while invalid.
      const dashboardBeforeEditing = getDashboardBeforeEditing(state);
      const clickBehaviorPath = ["visualization_settings", "click_behavior"];
      dashboard.ordered_cards = dashboard.ordered_cards.map((card, index) => {
        if (!clickBehaviorIsValid(getIn(card, clickBehaviorPath))) {
          const startingValue = getIn(dashboardBeforeEditing, [
            "ordered_cards",
            index,
            ...clickBehaviorPath,
          ]);
          return startingValue == null
            ? dissocIn(card, clickBehaviorPath)
            : assocIn(card, clickBehaviorPath, startingValue);
        }
        return card;
      });

      // remove isRemoved dashboards
      await Promise.all(
        dashboard.ordered_cards
          .filter(dc => dc.isRemoved && !dc.isAdded)
          .map(dc =>
            DashboardApi.removecard({
              dashId: dashboard.id,
              dashcardId: dc.id,
            }),
          ),
      );

      // add isAdded dashboards
      const updatedDashcards = await Promise.all(
        dashboard.ordered_cards
          .filter(dc => !dc.isRemoved)
          .map(async dc => {
            if (dc.isAdded) {
              const result = await DashboardApi.addcard({
                dashId: dashboard.id,
                cardId: dc.card_id,
              });
              dispatch(updateDashcardId(dc.id, result.id));

              // mark isAdded because addcard doesn't record the position
              return {
                ...result,
                col: dc.col,
                row: dc.row,
                sizeX: dc.sizeX,
                sizeY: dc.sizeY,
                series: dc.series,
                parameter_mappings: dc.parameter_mappings,
                visualization_settings: dc.visualization_settings,
                isAdded: true,
              };
            } else {
              return dc;
            }
          }),
      );

      // update modified cards
      await Promise.all(
        dashboard.ordered_cards
          .filter(dc => dc.card.isDirty)
          .map(async dc => CardApi.update(dc.card)),
      );

      // update the dashboard itself
      if (dashboard.isDirty) {
        const { id, name, description, parameters } = dashboard;
        await dispatch(
          Dashboards.actions.update({ id }, { name, description, parameters }),
        );
      }

      // reposition the cards
      if (_.some(updatedDashcards, dc => dc.isDirty || dc.isAdded)) {
        const cards = updatedDashcards.map(
          ({
            id,
            card_id,
            row,
            col,
            sizeX,
            sizeY,
            series,
            parameter_mappings,
            visualization_settings,
          }) => ({
            id,
            card_id,
            row,
            col,
            sizeX,
            sizeY,
            series,
            visualization_settings,
            parameter_mappings:
              parameter_mappings &&
              parameter_mappings.filter(
                mapping =>
                  // filter out mappings for deleted parameters
                  _.findWhere(dashboard.parameters, {
                    id: mapping.parameter_id,
                  }) &&
                  // filter out mappings for deleted series
                  (card_id === mapping.card_id ||
                    _.findWhere(series, { id: mapping.card_id })),
              ),
          }),
        );

        const result = await DashboardApi.reposition_cards({
          dashId: dashboard.id,
          cards,
        });
        if (result.status !== "ok") {
          throw new Error(result.status);
        }
      }

      await dispatch(Dashboards.actions.update(dashboard));

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      dispatch(fetchDashboard(dashboard.id, null)); // disable using query parameters when saving
    };
  },
);

export const removeCardFromDashboard = createAction(REMOVE_CARD_FROM_DASH);

const updateDashcardId = createAction(
  UPDATE_DASHCARD_ID,
  (oldDashcardId, newDashcardId) => ({ oldDashcardId, newDashcardId }),
);

export const clearCardData = createAction(
  CLEAR_CARD_DATA,
  (cardId, dashcardId) => ({ cardId, dashcardId }),
);

export const fetchDashboardCardData = createThunkAction(
  FETCH_DASHBOARD_CARD_DATA,
  options => (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());

    const promises = getAllDashboardCards(dashboard)
      .map(({ card, dashcard }) => {
        if (!isVirtualDashCard(dashcard)) {
          return dispatch(fetchCardData(card, dashcard, options)).then(() => {
            return dispatch(updateLoadingTitle());
          });
        }
      })
      .filter(p => !!p);

    dispatch(setDocumentTitle(t`0/${promises.length} loaded`));

    Promise.all(promises).then(() => {
      dispatch(loadingComplete());
    });
  },
);

const loadingComplete = createThunkAction(
  SET_LOADING_DASHCARDS_COMPLETE,
  () => dispatch => {
    dispatch(setShowLoadingCompleteFavicon(true));
    if (!document.hidden) {
      dispatch(setDocumentTitle(""));
      setTimeout(() => {
        dispatch(setShowLoadingCompleteFavicon(false));
      }, 3000);
    } else {
      dispatch(setDocumentTitle(t`Your dashboard is ready`));
      document.addEventListener(
        "visibilitychange",
        () => {
          dispatch(setDocumentTitle(""));
          setTimeout(() => {
            dispatch(setShowLoadingCompleteFavicon(false));
          }, 3000);
        },
        { once: true },
      );
    }
  },
);

export const cancelFetchDashboardCardData = createThunkAction(
  CANCEL_FETCH_DASHBOARD_CARD_DATA,
  () => (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());
    for (const { card, dashcard } of getAllDashboardCards(dashboard)) {
      dispatch(cancelFetchCardData(card.id, dashcard.id));
    }
  },
);

// TODO: this doesn't need to be stored in Redux, does it?
const cardDataCancelDeferreds = {};

// machinery to support query cancellation
export const cancelFetchCardData = createAction(
  CANCEL_FETCH_CARD_DATA,
  (card_id, dashcard_id) => {
    const deferred = cardDataCancelDeferreds[`${dashcard_id},${card_id}`];
    if (deferred) {
      deferred.resolve();
      cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = null;
    }
    return { dashcard_id, card_id };
  },
);
function setFetchCardDataCancel(card_id, dashcard_id, deferred) {
  cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = deferred;
}

export const fetchCardData = createThunkAction(FETCH_CARD_DATA, function(
  card,
  dashcard,
  { reload, clear, ignoreCache } = {},
) {
  return async function(dispatch, getState) {
    // If the dataset_query was filtered then we don't have permisison to view this card, so
    // shortcircuit and return a fake 403
    if (!card.dataset_query) {
      return {
        dashcard_id: dashcard.id,
        card_id: card.id,
        result: { error: { status: 403 } },
      };
    }

    const dashboardType = getDashboardType(dashcard.dashboard_id);

    const {
      dashboardId,
      dashboards,
      parameterValues,
      dashcardData,
    } = getState().dashboard;
    const dashboard = dashboards[dashboardId];

    // if we have a parameter, apply it to the card query before we execute
    const datasetQuery = applyParameters(
      card,
      dashboard.parameters,
      parameterValues,
      dashcard && dashcard.parameter_mappings,
    );

    if (!reload) {
      // if reload not set, check to see if the last result has the same query dict and return that
      const lastResult = getIn(dashcardData, [dashcard.id, card.id]);
      if (
        lastResult &&
        Utils.equals(
          getDatasetQueryParams(lastResult.json_query),
          getDatasetQueryParams(datasetQuery),
        )
      ) {
        return {
          dashcard_id: dashcard.id,
          card_id: card.id,
          result: lastResult,
        };
      }
    }

    cancelFetchCardData(card.id, dashcard.id);

    if (clear) {
      // clears the card data to indicate the card is reloading
      dispatch(clearCardData(card.id, dashcard.id));
    }

    let result = null;

    // start a timer that will show the expected card duration if the query takes too long
    const slowCardTimer = setTimeout(() => {
      if (result === null) {
        dispatch(markCardAsSlow(card, datasetQuery));
      }
    }, DATASET_SLOW_TIMEOUT);

    const deferred = defer();
    setFetchCardDataCancel(card.id, dashcard.id, deferred);

    let cancelled = false;
    deferred.promise.then(() => {
      cancelled = true;
    });

    const queryOptions = {
      cancelled: deferred.promise,
    };

    // make the actual request
    if (datasetQuery.type === "endpoint") {
      result = await fetchDataOrError(
        MetabaseApi.datasetEndpoint(
          {
            endpoint: datasetQuery.endpoint,
            parameters: datasetQuery.parameters,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "public") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(PublicApi.dashboardCardQuery, card)(
          {
            uuid: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            parameters: datasetQuery.parameters
              ? JSON.stringify(datasetQuery.parameters)
              : undefined,
            ignore_cache: ignoreCache,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "embed") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(EmbedApi.dashboardCardQuery, card)(
          {
            token: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            ...getParameterValuesBySlug(dashboard.parameters, parameterValues),
            ignore_cache: ignoreCache,
          },
          queryOptions,
        ),
      );
    } else if (dashboardType === "transient" || dashboardType === "inline") {
      result = await fetchDataOrError(
        maybeUsePivotEndpoint(MetabaseApi.dataset, card)(
          { ...datasetQuery, ignore_cache: ignoreCache },
          queryOptions,
        ),
      );
    } else {
      // new dashcards and new additional series cards aren't yet saved to the dashboard, so they need to be run using the card query endpoint
      const endpoint =
        isNewDashcard(dashcard) || isNewAdditionalSeriesCard(card, dashcard)
          ? CardApi.query
          : DashboardApi.cardQuery;

      result = await fetchDataOrError(
        maybeUsePivotEndpoint(endpoint, card)(
          {
            dashboardId: dashcard.dashboard_id,
            dashcardId: dashcard.id,
            cardId: card.id,
            parameters: datasetQuery.parameters,
            ignore_cache: ignoreCache,
            dashboard_id: dashcard.dashboard_id,
          },
          queryOptions,
        ),
      );
    }

    setFetchCardDataCancel(card.id, dashcard.id, null);
    clearTimeout(slowCardTimer);

    return {
      dashcard_id: dashcard.id,
      card_id: card.id,
      result: cancelled ? null : result,
    };
  };
});

const updateLoadingTitle = createThunkAction(
  SET_DOCUMENT_TITLE,
  () => (dispatch, getState) => {
    const loadingDashCards = getLoadingDashCards(getState());
    const totalCards = loadingDashCards.dashcardIds.length;
    const loadingComplete = totalCards - loadingDashCards.loadingIds.length;
    return `${loadingComplete}/${totalCards} loaded`;
  },
);

export const markCardAsSlow = createAction(MARK_CARD_AS_SLOW, card => ({
  id: card.id,
  result: true,
}));

export const fetchDashboard = createThunkAction(FETCH_DASHBOARD, function(
  dashId,
  queryParams,
  preserveParameters,
) {
  let result;
  return async function(dispatch, getState) {
    const dashboardType = getDashboardType(dashId);
    if (dashboardType === "public") {
      result = await PublicApi.dashboard({ uuid: dashId });
      result = {
        ...result,
        id: dashId,
        ordered_cards: result.ordered_cards.map(dc => ({
          ...dc,
          dashboard_id: dashId,
        })),
      };
    } else if (dashboardType === "embed") {
      result = await EmbedApi.dashboard({ token: dashId });
      result = {
        ...result,
        id: dashId,
        ordered_cards: result.ordered_cards.map(dc => ({
          ...dc,
          dashboard_id: dashId,
        })),
      };
    } else if (dashboardType === "transient") {
      const subPath = dashId
        .split("/")
        .slice(3)
        .join("/");
      result = await AutoApi.dashboard({ subPath });
      result = {
        ...result,
        id: dashId,
        ordered_cards: result.ordered_cards.map(dc => ({
          ...dc,
          dashboard_id: dashId,
        })),
      };
    } else if (dashboardType === "inline") {
      // HACK: this is horrible but the easiest way to get "inline" dashboards up and running
      // pass the dashboard in as dashboardId, and replace the id with [object Object] because
      // that's what it will be when cast to a string
      result = expandInlineDashboard(dashId);
      dashId = result.id = String(dashId);
    } else {
      result = await DashboardApi.get({ dashId: dashId });
    }

    if (dashboardType === "normal" || dashboardType === "transient") {
      await dispatch(loadMetadataForDashboard(result.ordered_cards));
    }

    // copy over any virtual cards from the dashcard to the underlying card/question
    result.ordered_cards.forEach(card => {
      if (card.visualization_settings.virtual_card) {
        card.card = Object.assign(
          card.card || {},
          card.visualization_settings.virtual_card,
        );
      }
    });

    if (result.param_values) {
      dispatch(addParamValues(result.param_values));
    }
    if (result.param_fields) {
      dispatch(addFields(result.param_fields));
    }

    const metadata = getMetadata(getState());
    const parameters = getDashboardUiParameters(result, metadata);

    const parameterValuesById = preserveParameters
      ? getParameterValues(getState())
      : getParameterValuesByIdFromQueryParams(
          parameters,
          queryParams,
          metadata,
          {
            forcefullyUnsetDefaultedParametersWithEmptyStringValue: true,
          },
        );

    return {
      ...normalize(result, dashboard), // includes `result` and `entities`
      dashboardId: dashId,
      parameterValues: parameterValuesById,
    };
  };
});

export const UPDATE_ENABLE_EMBEDDING =
  "metabase/dashboard/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(
  UPDATE_ENABLE_EMBEDDING,
  ({ id }, enable_embedding) => DashboardApi.update({ id, enable_embedding }),
);

export const UPDATE_EMBEDDING_PARAMS =
  "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }, embedding_params) => DashboardApi.update({ id, embedding_params }),
);

export const onUpdateDashCardVisualizationSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  (id, settings) => ({ id, settings }),
);
export const onUpdateDashCardColumnSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN,
  (id, column, settings) => ({ id, column, settings }),
);
export const onReplaceAllDashCardVisualizationSettings = createAction(
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  (id, settings) => ({ id, settings }),
);

export const setParameterMapping = createThunkAction(
  SET_PARAMETER_MAPPING,
  (parameter_id, dashcard_id, card_id, target) => (dispatch, getState) => {
    let parameter_mappings =
      getState().dashboard.dashcards[dashcard_id].parameter_mappings || [];
    parameter_mappings = parameter_mappings.filter(
      m => m.card_id !== card_id || m.parameter_id !== parameter_id,
    );
    if (target) {
      parameter_mappings = parameter_mappings.concat({
        parameter_id,
        card_id,
        target,
      });
    }
    dispatch(
      setDashCardAttributes({
        id: dashcard_id,
        attributes: { parameter_mappings },
      }),
    );
  },
);

function updateParameter(dispatch, getState, id, parameterUpdater) {
  const dashboard = getDashboard(getState());
  const index = _.findIndex(
    dashboard && dashboard.parameters,
    p => p.id === id,
  );
  if (index >= 0) {
    const parameters = assoc(
      dashboard.parameters,
      index,
      parameterUpdater(dashboard.parameters[index]),
    );
    dispatch(
      setDashboardAttributes({ id: dashboard.id, attributes: { parameters } }),
    );
  }
}

function updateParameters(dispatch, getState, parametersUpdater) {
  const dashboard = getDashboard(getState());
  if (dashboard) {
    const parameters = parametersUpdater(dashboard.parameters || []);
    dispatch(
      setDashboardAttributes({ id: dashboard.id, attributes: { parameters } }),
    );
  }
}

export const addParameter = createThunkAction(
  ADD_PARAMETER,
  parameterOption => (dispatch, getState) => {
    let parameter;
    updateParameters(dispatch, getState, parameters => {
      parameter = createParameter(parameterOption, parameters);
      return parameters.concat(parameter);
    });

    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.editParameter,
        props: {
          parameterId: parameter.id,
        },
      }),
    );
  },
);

export const removeParameter = createThunkAction(
  REMOVE_PARAMETER,
  parameterId => (dispatch, getState) => {
    updateParameters(dispatch, getState, parameters =>
      parameters.filter(p => p.id !== parameterId),
    );
  },
);

export const setParameter = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId, parameter) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, () => parameter);
    return { id: parameterId, ...parameter };
  },
);

export const setParameterName = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId, name) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter =>
      setParamName(parameter, name),
    );
    return { id: parameterId, name };
  },
);

export const setParameterFilteringParameters = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId, filteringParameters) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter => ({
      ...parameter,
      filteringParameters,
    }));
    return { id: parameterId, filteringParameters };
  },
);

export const setParameterDefaultValue = createThunkAction(
  SET_PARAMETER_DEFAULT_VALUE,
  (parameterId, defaultValue) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter =>
      setParamDefaultValue(parameter, defaultValue),
    );
    return { id: parameterId, defaultValue };
  },
);

export const setParameterIndex = createThunkAction(
  SET_PARAMETER_INDEX,
  (parameterId, index) => (dispatch, getState) => {
    const dashboard = getDashboard(getState());
    const parameterIndex = _.findIndex(
      dashboard.parameters,
      p => p.id === parameterId,
    );
    if (parameterIndex >= 0) {
      const parameters = dashboard.parameters.slice();
      parameters.splice(index, 0, parameters.splice(parameterIndex, 1)[0]);
      dispatch(
        setDashboardAttributes({
          id: dashboard.id,
          attributes: { parameters },
        }),
      );
    }
    return { id: parameterId, index };
  },
);

export const setParameterValue = createThunkAction(
  SET_PARAMETER_VALUE,
  (parameterId, value) => (dispatch, getState) => {
    return { id: parameterId, value };
  },
);

export const setOrUnsetParameterValues = parameterIdValuePairs => (
  dispatch,
  getState,
) => {
  const parameterValues = getParameterValues(getState());
  parameterIdValuePairs
    .map(([id, value]) =>
      setParameterValue(id, value === parameterValues[id] ? null : value),
    )
    .forEach(dispatch);
};

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";
export const createPublicLink = createAction(
  CREATE_PUBLIC_LINK,
  async ({ id }) => {
    const { uuid } = await DashboardApi.createPublicLink({ id });
    return { id, uuid };
  },
);

export const DELETE_PUBLIC_LINK = "metabase/dashboard/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAction(
  DELETE_PUBLIC_LINK,
  async ({ id }) => {
    await DashboardApi.deletePublicLink({ id });
    return { id };
  },
);

/**
 * All navigation actions from dashboards to cards (e.x. clicking a title, drill through)
 * should go through this action, which merges any currently applied dashboard filters
 * into the new card / URL parameters.
 *
 * User-triggered events that are handled here:
 *     - clicking a dashcard legend:
 *         * question title legend (only for single-question cards)
 *         * series legend (multi-aggregation, multi-breakout, multiple questions)
 *     - clicking the visualization inside dashcard
 *         * drill-through (single series, multi-aggregation, multi-breakout, multiple questions)
 *         * (not in 0.24.2 yet: drag on line/area/bar visualization)
 *     - those all can be applied without or with a dashboard filter
 */

const NAVIGATE_TO_NEW_CARD = "metabase/dashboard/NAVIGATE_TO_NEW_CARD";
export const navigateToNewCardFromDashboard = createThunkAction(
  NAVIGATE_TO_NEW_CARD,
  ({ nextCard, previousCard, dashcard, objectId }) => (dispatch, getState) => {
    const metadata = getMetadata(getState());
    const { dashboardId, dashboards, parameterValues } = getState().dashboard;
    const dashboard = dashboards[dashboardId];
    const cardAfterClick = getCardAfterVisualizationClick(
      nextCard,
      previousCard,
    );

    let question = new Question(cardAfterClick, metadata);
    if (question.query().isEditable()) {
      question = question
        .setDisplay(cardAfterClick.display || previousCard.display)
        .setSettings(dashcard.card.visualization_settings)
        .lockDisplay();
    } else {
      question = question.setCard(dashcard.card).setDashboardProps({
        dashboardId: dashboard.id,
        dashcardId: dashcard.id,
      });
    }

    const parametersMappedToCard = getParametersMappedToDashcard(
      dashboard,
      dashcard,
    );

    // When drilling from a native model, the drill can return a new question
    // querying a table for which we don't have any metadata for
    // When building a question URL, it'll usually clean the query and
    // strip clauses referencing fields from tables without metadata
    const previousQuestion = new Question(previousCard, metadata);
    const isDrillingFromNativeModel =
      previousQuestion.isDataset() && previousQuestion.isNative();

    const url = question.getUrlWithParameters(
      parametersMappedToCard,
      parameterValues,
      {
        clean: !isDrillingFromNativeModel,
        objectId,
      },
    );

    dispatch(openUrl(url));
  },
);

const loadMetadataForDashboard = dashCards => (dispatch, getState) => {
  const metadata = getMetadata(getState());

  const questions = dashCards
    .filter(dc => !isVirtualDashCard(dc) && dc.card.dataset_query) // exclude text cards and queries without perms
    .flatMap(dc => [dc.card].concat(dc.series || []))
    .map(card => new Question(card, metadata));

  return dispatch(
    loadMetadataForQueries(
      questions.map(question => question.query()),
      questions.map(question => question.dependentMetadata()),
    ),
  );
};

export const fetchDashboardParameterValues = createThunkAction(
  FETCH_DASHBOARD_PARAMETER_FIELD_VALUES,
  ({ dashboardId, parameter, parameters, query }) => async (
    dispatch,
    getState,
  ) => {
    const parameterValuesSearchCache = getDashboardParameterValuesSearchCache(
      getState(),
    );
    const filteringParameterValues = getFilteringParameterValuesMap(
      parameter,
      parameters,
    );
    const cacheKey = getParameterValuesSearchKey({
      dashboardId,
      parameterId: parameter.id,
      query,
      filteringParameterValues,
    });

    if (parameterValuesSearchCache[cacheKey]) {
      return;
    }

    const endpoint = query
      ? DashboardApi.parameterSearch
      : DashboardApi.parameterValues;
    const results = await endpoint({
      paramId: parameter.id,
      dashId: dashboardId,
      query,
      ...filteringParameterValues,
    });

    return {
      cacheKey,
      results: results.map(result => [].concat(result)),
    };
  },
);
