/* @flow weak */

import { assoc, dissoc, assocIn, getIn, chain } from "icepick";
import _ from "underscore";
import moment from "moment";

import {
  handleActions,
  combineReducers,
  createAction,
  createThunkAction,
} from "metabase/lib/redux";
import { normalize, schema } from "normalizr";

import Dashboards from "metabase/entities/dashboards";

import {
  createParameter,
  setParameterName as setParamName,
  setParameterDefaultValue as setParamDefaultValue,
} from "metabase/meta/Dashboard";
import { applyParameters, questionUrlWithParameters } from "metabase/meta/Card";
import { getParametersBySlug } from "metabase/meta/Parameter";

import type {
  DashboardWithCards,
  DashCard,
  DashCardId,
} from "metabase/meta/types/Dashboard";
import type { Card, CardId } from "metabase/meta/types/Card";

import Utils from "metabase/lib/utils";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { createCard } from "metabase/lib/card";

import {
  addParamValues,
  addFields,
  fetchDatabaseMetadata,
} from "metabase/redux/metadata";
import { push } from "react-router-redux";

import {
  DashboardApi,
  CardApi,
  RevisionApi,
  PublicApi,
  EmbedApi,
  AutoApi,
  MetabaseApi,
} from "metabase/services";

import { getDashboard, getDashboardComplete } from "./selectors";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";

const DATASET_SLOW_TIMEOUT = 15 * 1000;

// normalizr schemas
const dashcard = new schema.Entity("dashcard");
const card = new schema.Entity("card");
const dashboard = new schema.Entity("dashboard", {
  ordered_cards: [dashcard],
});

// action constants

export const INITIALIZE = "metabase/dashboard/INITIALIZE";

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";

export const FETCH_CARDS = "metabase/dashboard/FETCH_CARDS";
export const DELETE_CARD = "metabase/dashboard/DELETE_CARD";

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
export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS";
export const REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS";
export const UPDATE_DASHCARD_ID = "metabase/dashboard/UPDATE_DASHCARD_ID";

export const FETCH_DASHBOARD_CARD_DATA =
  "metabase/dashboard/FETCH_DASHBOARD_CARD_DATA";
export const FETCH_CARD_DATA = "metabase/dashboard/FETCH_CARD_DATA";
export const MARK_CARD_AS_SLOW = "metabase/dashboard/MARK_CARD_AS_SLOW";
export const CLEAR_CARD_DATA = "metabase/dashboard/CLEAR_CARD_DATA";

export const FETCH_REVISIONS = "metabase/dashboard/FETCH_REVISIONS";
export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";

export const SET_EDITING_PARAMETER_ID =
  "metabase/dashboard/SET_EDITING_PARAMETER_ID";
export const ADD_PARAMETER = "metabase/dashboard/ADD_PARAMETER";
export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const SET_PARAMETER_MAPPING = "metabase/dashboard/SET_PARAMETER_MAPPING";
export const SET_PARAMETER_NAME = "metabase/dashboard/SET_PARAMETER_NAME";
export const SET_PARAMETER_VALUE = "metabase/dashboard/SET_PARAMETER_VALUE";
export const SET_PARAMETER_INDEX = "metabase/dashboard/SET_PARAMETER_INDEX";
export const SET_PARAMETER_DEFAULT_VALUE =
  "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";

function getDashboardType(id) {
  if (Utils.isUUID(id)) {
    return "public";
  } else if (Utils.isJWT(id)) {
    return "embed";
  } else if (/\/auto\/dashboard/.test(id)) {
    return "transient";
  } else {
    return "normal";
  }
}

// action creators

export const initialize = createAction(INITIALIZE);
export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);

export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

// these operations don't get saved to server immediately
export const setDashboardAttributes = createAction(SET_DASHBOARD_ATTRIBUTES);
export const setDashCardAttributes = createAction(SET_DASHCARD_ATTRIBUTES);

// TODO: consolidate with questions reducer
export const fetchCards = createThunkAction(FETCH_CARDS, function(
  filterMode = "all",
) {
  return async function(dispatch, getState) {
    let cards = await CardApi.list({ f: filterMode });
    for (let c of cards) {
      c.updated_at = moment(c.updated_at);
    }
    return normalize(cards, [card]);
  };
});

export const deleteCard = createThunkAction(DELETE_CARD, function(cardId) {
  return async function(dispatch, getState) {
    await CardApi.delete({ cardId });
    return cardId;
  };
});

export const addCardToDashboard = function({
  dashId,
  cardId,
}: {
  dashId: DashCardId,
  cardId: CardId,
}) {
  return function(dispatch, getState) {
    const { dashboards, dashcards, cards } = getState().dashboard;
    const dashboard: DashboardWithCards = dashboards[dashId];
    const existingCards: Array<DashCard> = dashboard.ordered_cards
      .map(id => dashcards[id])
      .filter(dc => !dc.isRemoved);
    const card: Card = cards[cardId];
    const dashcard: DashCard = {
      id: Math.random(), // temporary id
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
  };
};

export const addDashCardToDashboard = function({
  dashId,
  dashcardOverrides,
}: {
  dashId: DashCardId,
  dashcardOverrides: {},
}) {
  return function(dispatch, getState) {
    const { dashboards, dashcards } = getState().dashboard;
    const dashboard: DashboardWithCards = dashboards[dashId];
    const existingCards: Array<DashCard> = dashboard.ordered_cards
      .map(id => dashcards[id])
      .filter(dc => !dc.isRemoved);
    const dashcard: DashCard = {
      id: Math.random(), // temporary id
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

export const addTextDashCardToDashboard = function({
  dashId,
}: {
  dashId: DashCardId,
}) {
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
      let { dashboards, dashcards, dashboardId } = getState().dashboard;
      let dashboard = {
        ...dashboards[dashboardId],
        ordered_cards: dashboards[dashboardId].ordered_cards.map(
          dashcardId => dashcards[dashcardId],
        ),
      };

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
      let updatedDashcards = await Promise.all(
        dashboard.ordered_cards.filter(dc => !dc.isRemoved).map(async dc => {
          if (dc.isAdded) {
            let result = await DashboardApi.addcard({
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
        let { id, name, description, parameters } = dashboard;
        await dispatch(
          Dashboards.actions.update({ id }, { name, description, parameters }),
        );
      }

      // reposition the cards
      if (_.some(updatedDashcards, dc => dc.isDirty || dc.isAdded)) {
        let cards = updatedDashcards.map(
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
                  // filter out mappings for deleted paramters
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
      dispatch(fetchDashboard(dashboard.id, null, true)); // disable using query parameters when saving
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

export async function fetchDataOrError(dataPromise) {
  try {
    return await dataPromise;
  } catch (error) {
    return { error };
  }
}

export const fetchDashboardCardData = createThunkAction(
  FETCH_DASHBOARD_CARD_DATA,
  options => async (dispatch, getState) => {
    const dashboard = getDashboardComplete(getState());
    if (dashboard) {
      for (const dashcard of dashboard.ordered_cards) {
        // we skip over virtual cards, i.e. dashcards that do not have backing cards in the backend
        if (_.isObject(dashcard.visualization_settings.virtual_card)) {
          continue;
        }
        const cards = [dashcard.card].concat(dashcard.series || []);
        for (const card of cards) {
          dispatch(fetchCardData(card, dashcard, options));
        }
      }
    }
  },
);

export const fetchCardData = createThunkAction(FETCH_CARD_DATA, function(
  card,
  dashcard,
  { reload, clear } = {},
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
      // "constraints" is added by the backend, remove it when comparing
      if (
        lastResult &&
        Utils.equals(_.omit(lastResult.json_query, "constraints"), datasetQuery)
      ) {
        return {
          dashcard_id: dashcard.id,
          card_id: card.id,
          result: lastResult,
        };
      }
    }

    if (clear) {
      // clears the card data to indicate the card is reloading
      dispatch(clearCardData(card.id, dashcard.id));
    }

    let result = null;

    // start a timer that will show the expected card duration if the query takes too long
    let slowCardTimer = setTimeout(() => {
      if (result === null) {
        dispatch(markCardAsSlow(card, datasetQuery));
      }
    }, DATASET_SLOW_TIMEOUT);

    // make the actual request
    if (dashboardType === "public") {
      result = await fetchDataOrError(
        PublicApi.dashboardCardQuery({
          uuid: dashcard.dashboard_id,
          cardId: card.id,
          parameters: datasetQuery.parameters
            ? JSON.stringify(datasetQuery.parameters)
            : undefined,
        }),
      );
    } else if (dashboardType === "embed") {
      result = await fetchDataOrError(
        EmbedApi.dashboardCardQuery({
          token: dashcard.dashboard_id,
          dashcardId: dashcard.id,
          cardId: card.id,
          ...getParametersBySlug(dashboard.parameters, parameterValues),
        }),
      );
    } else if (dashboardType === "transient") {
      result = await fetchDataOrError(MetabaseApi.dataset(datasetQuery));
    } else {
      result = await fetchDataOrError(
        CardApi.query({ cardId: card.id, parameters: datasetQuery.parameters }),
      );
    }

    clearTimeout(slowCardTimer);

    return {
      dashcard_id: dashcard.id,
      card_id: card.id,
      result: result,
    };
  };
});

export const markCardAsSlow = createAction(MARK_CARD_AS_SLOW, card => ({
  id: card.id,
  result: true,
}));

export const fetchDashboard = createThunkAction(FETCH_DASHBOARD, function(
  dashId,
  queryParams,
  enableDefaultParameters = true,
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
    } else {
      result = await DashboardApi.get({ dashId: dashId });
    }

    const parameterValues = {};
    if (result.parameters) {
      for (const parameter of result.parameters) {
        if (queryParams && queryParams[parameter.slug] != null) {
          parameterValues[parameter.id] = queryParams[parameter.slug];
        } else if (enableDefaultParameters && parameter.default != null) {
          parameterValues[parameter.id] = parameter.default;
        }
      }
    }

    if (dashboardType === "normal" || dashboardType === "transient") {
      // fetch database metadata for every card
      _.chain(result.ordered_cards)
        .map(dc => [dc.card].concat(dc.series))
        .flatten()
        .filter(
          card => card && card.dataset_query && card.dataset_query.database,
        )
        .map(card => card.dataset_query.database)
        .uniq()
        .each(dbId => dispatch(fetchDatabaseMetadata(dbId)));
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

    return {
      ...normalize(result, dashboard), // includes `result` and `entities`
      dashboardId: dashId,
      parameterValues: parameterValues,
    };
  };
});

const UPDATE_ENABLE_EMBEDDING = "metabase/dashboard/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(
  UPDATE_ENABLE_EMBEDDING,
  ({ id }, enable_embedding) => DashboardApi.update({ id, enable_embedding }),
);

const UPDATE_EMBEDDING_PARAMS = "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }, embedding_params) => DashboardApi.update({ id, embedding_params }),
);

export const fetchRevisions = createThunkAction(FETCH_REVISIONS, function({
  entity,
  id,
}) {
  return async function(dispatch, getState) {
    let revisions = await RevisionApi.list({ entity, id });
    return { entity, id, revisions };
  };
});

export const revertToRevision = createThunkAction(REVERT_TO_REVISION, function({
  entity,
  id,
  revision_id,
}) {
  return async function(dispatch, getState) {
    await RevisionApi.revert({ entity, id, revision_id });
  };
});

export const onUpdateDashCardVisualizationSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  (id, settings) => ({ id, settings }),
);
export const onReplaceAllDashCardVisualizationSettings = createAction(
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  (id, settings) => ({ id, settings }),
);

export const setEditingParameter = createAction(SET_EDITING_PARAMETER_ID);
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
    return parameter;
  },
);

export const removeParameter = createThunkAction(
  REMOVE_PARAMETER,
  parameterId => (dispatch, getState) => {
    updateParameters(dispatch, getState, parameters =>
      parameters.filter(p => p.id !== parameterId),
    );
    return { id: parameterId };
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

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";
export const createPublicLink = createAction(
  CREATE_PUBLIC_LINK,
  async ({ id }) => {
    let { uuid } = await DashboardApi.createPublicLink({ id });
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
  ({ nextCard, previousCard, dashcard }) => (dispatch, getState) => {
    const metadata = getMetadata(getState());
    const { dashboardId, dashboards, parameterValues } = getState().dashboard;
    const dashboard = dashboards[dashboardId];
    const cardIsDirty = !_.isEqual(
      previousCard.dataset_query,
      nextCard.dataset_query,
    );
    const cardAfterClick = getCardAfterVisualizationClick(
      nextCard,
      previousCard,
    );

    // clicking graph title with a filter applied loses display type and visualization settings; see #5278
    const cardWithVizSettings = {
      ...cardAfterClick,
      display: cardAfterClick.display || previousCard.display,
      visualization_settings:
        cardAfterClick.visualization_settings ||
        previousCard.visualization_settings,
    };

    const url = questionUrlWithParameters(
      cardWithVizSettings,
      metadata,
      dashboard.parameters,
      parameterValues,
      dashcard && dashcard.parameter_mappings,
      cardIsDirty,
    );

    dispatch(push(url));
  },
);

// reducers

const dashboardId = handleActions(
  {
    [INITIALIZE]: { next: state => null },
    [FETCH_DASHBOARD]: {
      next: (state, { payload: { dashboardId } }) => dashboardId,
    },
  },
  null,
);

const isEditing = handleActions(
  {
    [INITIALIZE]: { next: state => false },
    [SET_EDITING_DASHBOARD]: { next: (state, { payload }) => payload },
  },
  false,
);

// TODO: consolidate with questions reducer
const cards = handleActions(
  {
    [FETCH_CARDS]: {
      next: (state, { payload }) => ({ ...payload.entities.card }),
    },
  },
  {},
);

const cardList = handleActions(
  {
    [FETCH_CARDS]: { next: (state, { payload }) => payload.result },
    [DELETE_CARD]: { next: (state, { payload }) => state },
  },
  null,
);

const dashboards = handleActions(
  {
    [FETCH_DASHBOARD]: {
      next: (state, { payload }) => ({
        ...state,
        ...payload.entities.dashboard,
      }),
    },
    [SET_DASHBOARD_ATTRIBUTES]: {
      next: (state, { payload: { id, attributes } }) => ({
        ...state,
        [id]: { ...state[id], ...attributes, isDirty: true },
      }),
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
      ...state,
      [dashcard.dashboard_id]: {
        ...state[dashcard.dashboard_id],
        ordered_cards: [
          ...state[dashcard.dashboard_id].ordered_cards,
          dashcard.id,
        ],
      },
    }),
    [CREATE_PUBLIC_LINK]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id, "public_uuid"], payload.uuid),
    },
    [DELETE_PUBLIC_LINK]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id, "public_uuid"], null),
    },
    [UPDATE_EMBEDDING_PARAMS]: {
      next: (state, { payload }) =>
        assocIn(
          state,
          [payload.id, "embedding_params"],
          payload.embedding_params,
        ),
    },
    [UPDATE_ENABLE_EMBEDDING]: {
      next: (state, { payload }) =>
        assocIn(
          state,
          [payload.id, "enable_embedding"],
          payload.enable_embedding,
        ),
    },
  },
  {},
);

const dashcards = handleActions(
  {
    [FETCH_DASHBOARD]: {
      next: (state, { payload }) => ({
        ...state,
        ...payload.entities.dashcard,
      }),
    },
    [SET_DASHCARD_ATTRIBUTES]: {
      next: (state, { payload: { id, attributes } }) => ({
        ...state,
        [id]: { ...state[id], ...attributes, isDirty: true },
      }),
    },
    [UPDATE_DASHCARD_VISUALIZATION_SETTINGS]: {
      next: (state, { payload: { id, settings } }) =>
        chain(state)
          .updateIn([id, "visualization_settings"], (value = {}) => ({
            ...value,
            ...settings,
          }))
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS]: {
      next: (state, { payload: { id, settings } }) =>
        chain(state)
          .assocIn([id, "visualization_settings"], settings)
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
      ...state,
      [dashcard.id]: { ...dashcard, isAdded: true, justAdded: true },
    }),
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId } }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], isRemoved: true },
    }),
    [MARK_NEW_CARD_SEEN]: (state, { payload: dashcardId }) => ({
      ...state,
      [dashcardId]: { ...state[dashcardId], justAdded: false },
    }),
  },
  {},
);

const editingParameterId = handleActions(
  {
    [SET_EDITING_PARAMETER_ID]: { next: (state, { payload }) => payload },
    [ADD_PARAMETER]: { next: (state, { payload: { id } }) => id },
  },
  null,
);

const revisions = handleActions(
  {
    [FETCH_REVISIONS]: {
      next: (state, { payload: { entity, id, revisions } }) => ({
        ...state,
        [entity + "-" + id]: revisions,
      }),
    },
  },
  {},
);

const dashcardData = handleActions(
  {
    // clear existing dashboard data when loading a dashboard
    [INITIALIZE]: { next: state => ({}) },
    [FETCH_CARD_DATA]: {
      next: (state, { payload: { dashcard_id, card_id, result } }) =>
        assocIn(state, [dashcard_id, card_id], result),
    },
    [CLEAR_CARD_DATA]: {
      next: (state, { payload: { cardId, dashcardId } }) =>
        assocIn(state, [dashcardId, cardId]),
    },
    [UPDATE_DASHCARD_ID]: {
      next: (state, { payload: { oldDashcardId, newDashcardId } }) =>
        chain(state)
          .assoc(newDashcardId, state[oldDashcardId])
          .dissoc(oldDashcardId)
          .value(),
    },
  },
  {},
);

const slowCards = handleActions(
  {
    [MARK_CARD_AS_SLOW]: {
      next: (state, { payload: { id, result } }) => ({
        ...state,
        [id]: result,
      }),
    },
  },
  {},
);

const parameterValues = handleActions(
  {
    [INITIALIZE]: { next: () => ({}) }, // reset values
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value } }) => assoc(state, id, value),
    },
    [REMOVE_PARAMETER]: {
      next: (state, { payload: { id } }) => dissoc(state, id),
    },
    [FETCH_DASHBOARD]: {
      next: (state, { payload: { parameterValues } }) => parameterValues,
    },
  },
  {},
);

export default combineReducers({
  dashboardId,
  isEditing,
  cards,
  cardList,
  dashboards,
  dashcards,
  editingParameterId,
  revisions,
  dashcardData,
  slowCards,
  parameterValues,
});
