/* @flow weak */

import i from "icepick";
import _ from "underscore";
import moment from "moment";

import { createAction } from "redux-actions";
import { handleActions, combineReducers, AngularResourceProxy, createThunkAction } from "metabase/lib/redux";
import { normalize, Schema, arrayOf } from "normalizr";

import MetabaseAnalytics from "metabase/lib/analytics";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { applyParameters } from "metabase/meta/Card";
import { fetchDatabaseMetadata } from "metabase/redux/metadata";

import type { DashboardObject, DashCardObject, DashCardId } from "metabase/meta/types/Dashboard";
import type { CardObject, CardId } from "metabase/meta/types/Card";

const DATASET_SLOW_TIMEOUT   = 15 * 1000;
const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

// normalizr schemas
const dashcard = new Schema('dashcard');
const card = new Schema('card');
const dashboard = new Schema('dashboard');
dashboard.define({
    ordered_cards: arrayOf(dashcard)
});

// action constants

export const INITIALIZE = "metabase/dashboard/INITIALIZE";

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";

export const FETCH_CARDS = "metabase/dashboard/FETCH_CARDS";
export const DELETE_CARD = "metabase/dashboard/DELETE_CARD";

export const FETCH_DASHBOARD = "metabase/dashboard/FETCH_DASHBOARD";
export const FETCH_DASHBOARDS = "metabase/dashboard/FETCH_DASHBOARDS";
export const CREATE_DASHBOARD = "metabase/dashboard/CREATE_DASHBOARD";
export const SAVE_DASHBOARD = "metabase/dashboard/SAVE_DASHBOARD";
export const UPDATE_DASHBOARD = "metabase/dashboard/UPDATE_DASHBOARD";
export const DELETE_DASHBOARD = "metabase/dashboard/DELETE_DASHBOARD";
export const SET_DASHBOARD_ATTRIBUTES = "metabase/dashboard/SET_DASHBOARD_ATTRIBUTES";

export const ADD_CARD_TO_DASH = "metabase/dashboard/ADD_CARD_TO_DASH";
export const REMOVE_CARD_FROM_DASH = "metabase/dashboard/REMOVE_CARD_FROM_DASH";
export const SET_DASHCARD_ATTRIBUTES = "metabase/dashboard/SET_DASHCARD_ATTRIBUTES";
export const SET_DASHCARD_VISUALIZATION_SETTING = "metabase/dashboard/SET_DASHCARD_VISUALIZATION_SETTING";
export const SET_DASHCARD_VISUALIZATION_SETTINGS = "metabase/dashboard/SET_DASHCARD_VISUALIZATION_SETTINGS";
export const UPDATE_DASHCARD_ID = "metabase/dashboard/UPDATE_DASHCARD_ID"
export const SAVE_DASHCARD = "metabase/dashboard/SAVE_DASHCARD";

export const FETCH_CARD_DATA = "metabase/dashboard/FETCH_CARD_DATA";
export const FETCH_CARD_DURATION = "metabase/dashboard/FETCH_CARD_DURATION";
export const CLEAR_CARD_DATA = "metabase/dashboard/CLEAR_CARD_DATA";

export const FETCH_REVISIONS = "metabase/dashboard/FETCH_REVISIONS";
export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";

export const FETCH_DATABASE_METADATA = "metabase/dashboard/FETCH_DATABASE_METADATA";

export const SET_EDITING_PARAMETER_ID = "metabase/dashboard/SET_EDITING_PARAMETER_ID";
export const ADD_PARAMETER = "metabase/dashboard/ADD_PARAMETER";
export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const SET_PARAMETER_MAPPING = "metabase/dashboard/SET_PARAMETER_MAPPING";
export const SET_PARAMETER_NAME = "metabase/dashboard/SET_PARAMETER_NAME";
export const SET_PARAMETER_VALUE = "metabase/dashboard/SET_PARAMETER_VALUE";
export const SET_PARAMETER_DEFAULT_VALUE = "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";

// resource wrappers
const DashboardApi = new AngularResourceProxy("Dashboard", [
    "list", "get", "create", "update", "delete", "reposition_cards", "addcard", "removecard"
]);
const MetabaseApi = new AngularResourceProxy("Metabase", ["dataset", "dataset_duration", "db_metadata"]);
const CardApi = new AngularResourceProxy("Card", ["list", "update", "delete", "query"]);
const RevisionApi = new AngularResourceProxy("Revision", ["list", "revert"]);

// action creators

export const initialize = createAction(INITIALIZE);
export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);

export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

// these operations don't get saved to server immediately
export const setDashboardAttributes = createAction(SET_DASHBOARD_ATTRIBUTES);
export const setDashCardAttributes = createAction(SET_DASHCARD_ATTRIBUTES);

export const fetchCards = createThunkAction(FETCH_CARDS, function(filterMode = "all") {
    return async function(dispatch, getState) {
        let cards = await CardApi.list({ f: filterMode });
        for (var c of cards) {
            c.updated_at = moment(c.updated_at);
        }
        return normalize(cards, arrayOf(card));
    };
});

export const deleteCard = createThunkAction(DELETE_CARD, function(cardId) {
    return async function(dispatch, getState) {
        await CardApi.delete({ cardId });
        return cardId;
    };
});

export const addCardToDashboard = function({ dashId, cardId }: { dashId: DashCardId, cardId: CardId }) {
    return function(dispatch, getState) {
        const { dashboards, dashcards, cards } = getState().dashboard;
        const dashboard: DashboardObject = dashboards[dashId];
        const existingCards: Array<DashCardObject> = dashboard.ordered_cards.map(id => dashcards[id]).filter(dc => !dc.isRemoved);
        const card: CardObject = cards[cardId];
        const dashcard: DashCardObject = {
            id: Math.random(), // temporary id
            dashboard_id: dashId,
            card_id: card.id,
            card: card,
            series: [],
            ...getPositionForNewDashCard(existingCards),
            parameter_mappings: [],
            visualization_settings: {}
        };
        dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
        dispatch(fetchCardData(card, dashcard, { reload: true, clear: true }));
    };
}

export const removeCardFromDashboard = createAction(REMOVE_CARD_FROM_DASH);

const updateDashcardId = createAction(UPDATE_DASHCARD_ID, (oldDashcardId, newDashcardId) => ({ oldDashcardId, newDashcardId }));

export const clearCardData = createAction(CLEAR_CARD_DATA, (cardId, dashcardId) => ({ cardId, dashcardId }));

export async function fetchDataOrError(dataPromise) {
    try {
        return await dataPromise;
    }
    catch (error) {
        return { error };
    }
}

export const fetchCardData = createThunkAction(FETCH_CARD_DATA, function(card, dashcard, { reload, clear } = {}) {
    return async function(dispatch, getState) {
        // If the dataset_query was filtered then we don't have permisison to view this card, so
        // shortcircuit and return a fake 403
        if (!card.dataset_query) {
            return {
                dashcard_id: dashcard.id,
                card_id: card.id,
                result: { error: { status: 403 }}
            };
        }

        const { dashboardId, dashboards, parameterValues, dashcardData } = getState().dashboard;
        const dashboard = dashboards[dashboardId];

        // if we have a parameter, apply it to the card query before we execute
        const datasetQuery = applyParameters(card, dashboard.parameters, parameterValues, dashcard && dashcard.parameter_mappings);

        if (!reload) {
            // if reload not set, check to see if the last result has the same query dict and return that
            const lastResult = i.getIn(dashcardData, [dashcard.id, card.id]);
            // "constraints" is added by the backend, remove it when comparing
            if (lastResult && angular.equals(_.omit(lastResult.json_query, "constraints"), datasetQuery)) {
                return {
                    dashcard_id: dashcard.id,
                    card_id: card.id,
                    result: lastResult
                };
            }
        }

        if (clear) {
            // clears the card data to indicate the card is reloading
            dispatch(clearCardData(card.id, dashcard.id));
        }

        let result = null;

        // start a timer that will fetch the expected card duration if the query takes too long
        let slowCardTimer = setTimeout(() => {
            if (result === null) {
                dispatch(fetchCardDuration(card, datasetQuery));
            }
        }, DATASET_SLOW_TIMEOUT);

        // make the actual request
        result = await fetchDataOrError(CardApi.query({cardID: card.id, parameters: datasetQuery.parameters}));

        clearTimeout(slowCardTimer);

        return {
            dashcard_id: dashcard.id,
            card_id: card.id,
            result: result
        };
    };
});

export const fetchCardDuration = createThunkAction(FETCH_CARD_DURATION, function(card, datasetQuery) {
    return async function(dispatch, getState) {
        let result = await MetabaseApi.dataset_duration(datasetQuery);
        return {
            id: card.id,
            result: {
                fast_threshold: DATASET_USUALLY_FAST_THRESHOLD,
                ...result
            }
        };
    };
});

const SET_DASHBOARD_ID = "metabase/dashboard/SET_DASHBOARD_ID";
export const setDashboardId = createAction(SET_DASHBOARD_ID);

export const fetchDashboard = createThunkAction(FETCH_DASHBOARD, function(dashId, queryParams, enableDefaultParameters = true) {
    return async function(dispatch, getState) {
        let result = await DashboardApi.get({ dashId: dashId });

        dispatch(setDashboardId(dashId));

        if (result.parameters) {
            for (const parameter of result.parameters) {
                if (queryParams && queryParams[parameter.slug] != null) {
                    dispatch(setParameterValue(parameter.id, queryParams[parameter.slug]));
                } else if (enableDefaultParameters && parameter.default != null) {
                    dispatch(setParameterValue(parameter.id, parameter.default));
                }
            }
        }

        // fetch database metadata for every card
        _.chain(result.ordered_cards)
            .map((dc) => [dc.card].concat(dc.series))
            .flatten()
            .filter(card => card && card.dataset_query && card.dataset_query.database)
            .map(card => card.dataset_query.database)
            .uniq()
            .each((dbId) => dispatch(fetchDatabaseMetadata(dbId)));

        return normalize(result, dashboard);
    };
});

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashId) {
    return async function(dispatch, getState) {
        let { dashboards, dashcards, dashboardId } = getState().dashboard;
        let dashboard = {
            ...dashboards[dashboardId],
            ordered_cards: dashboards[dashboardId].ordered_cards.map(dashcardId => dashcards[dashcardId])
        };

        // remove isRemoved dashboards
        await Promise.all(dashboard.ordered_cards
            .filter(dc => dc.isRemoved && !dc.isAdded)
            .map(dc => DashboardApi.removecard({ dashId: dashboard.id, dashcardId: dc.id })));

        // add isAdded dashboards
        let updatedDashcards = await Promise.all(dashboard.ordered_cards
            .filter(dc => !dc.isRemoved)
            .map(async dc => {
                if (dc.isAdded) {
                    let result = await DashboardApi.addcard({ dashId, cardId: dc.card_id });
                    dispatch(updateDashcardId(dc.id, result.id));
                    // mark isAdded because addcard doesn't record the position
                    return {
                        ...result,
                        col: dc.col, row: dc.row,
                        sizeX: dc.sizeX, sizeY: dc.sizeY,
                        series: dc.series,
                        parameter_mappings: dc.parameter_mappings,
                        visualization_settings: dc.visualization_settings,
                        isAdded: true
                    }
                } else {
                    return dc;
                }
            }));

        // update modified cards
        await Promise.all(dashboard.ordered_cards
            .filter(dc => dc.card.isDirty)
            .map(async dc => CardApi.update(dc.card)));

        // update the dashboard itself
        if (dashboard.isDirty) {
            let { id, name, description, parameters } = dashboard;
            dashboard = await DashboardApi.update({ id, name, description, parameters });
        }

        // reposition the cards
        if (_.some(updatedDashcards, (dc) => dc.isDirty || dc.isAdded)) {
            let cards = updatedDashcards.map(({ id, card_id, row, col, sizeX, sizeY, series, parameter_mappings, visualization_settings }) =>
                ({
                    id, card_id, row, col, sizeX, sizeY, series, visualization_settings,
                    parameter_mappings: parameter_mappings && parameter_mappings.filter(mapping =>
                        // filter out mappings for deleted paramters
                        _.findWhere(dashboard.parameters, { id: mapping.parameter_id }) &&
                        // filter out mappings for deleted series
                        (card_id === mapping.card_id || _.findWhere(series, { id: mapping.card_id }))
                    )
                })
            );
            var result = await DashboardApi.reposition_cards({ dashId, cards });
            if (result.status !== "ok") {
                throw new Error(result.status);
            }
        }

        // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
        dispatch(fetchDashboard(dashId, null, true)); // disable using query parameters when saving

        MetabaseAnalytics.trackEvent("Dashboard", "Update");

        return dashboard;
    };
});

export const updateDashboard = createThunkAction(UPDATE_DASHBOARD, (dashboard) =>
    async (dispatch, getState) => {
        const {
            id,
            name,
            description,
            parameters,
            caveats,
            points_of_interest,
            show_in_getting_started
        } = dashboard;

        const cleanDashboard = {
            id,
            name,
            description,
            parameters,
            caveats,
            points_of_interest,
            show_in_getting_started
        };

        const updatedDashboard = await DashboardApi.update(cleanDashboard);

        MetabaseAnalytics.trackEvent("Dashboard", "Update");

        return updatedDashboard;
    }
);

export const fetchDashboards = createAction(FETCH_DASHBOARDS, () =>
    DashboardApi.list({ f: "all" })
);

export const createDashboard = createAction(CREATE_DASHBOARD, (newDashboard) => {
    MetabaseAnalytics.trackEvent("Dashboard", "Create");
    return DashboardApi.create(newDashboard);
});

export const deleteDashboard = createAction(DELETE_DASHBOARD, async (dashId) => {
    MetabaseAnalytics.trackEvent("Dashboard", "Delete");
    await DashboardApi.delete({ dashId });
    return dashId;
});

export const fetchRevisions = createThunkAction(FETCH_REVISIONS, function({ entity, id }) {
    return async function(dispatch, getState) {
        let revisions = await RevisionApi.list({ entity, id });
        return { entity, id, revisions };
    };
});

export const revertToRevision = createThunkAction(REVERT_TO_REVISION, function({ entity, id, revision_id }) {
    return async function(dispatch, getState) {
        await RevisionApi.revert({ entity, id, revision_id });
    };
});

export const setDashCardVisualizationSetting = createAction(SET_DASHCARD_VISUALIZATION_SETTING);
export const setDashCardVisualizationSettings = createAction(SET_DASHCARD_VISUALIZATION_SETTINGS);

export const setEditingParameterId = createAction(SET_EDITING_PARAMETER_ID);
export const setParameterMapping = createThunkAction(SET_PARAMETER_MAPPING, (parameter_id, dashcard_id, card_id, target) =>
    (dispatch, getState) => {
        let parameter_mappings = getState().dashboard.dashcards[dashcard_id].parameter_mappings || [];
        parameter_mappings = parameter_mappings.filter(m => m.card_id !== card_id || m.parameter_id !== parameter_id);
        if (target) {
            parameter_mappings = parameter_mappings.concat({ parameter_id, card_id, target })
        }
        dispatch(setDashCardAttributes({ id: dashcard_id, attributes: { parameter_mappings }}));
    }
);

export const setParameterValue = createThunkAction(SET_PARAMETER_VALUE, (parameterId, value) =>
    (dispatch, getState) => {
        return { id: parameterId, value };
    }
)

export const removeParameter = createThunkAction(REMOVE_PARAMETER, (parameterId) =>
    (dispatch, getState) => ({ id: parameterId })
);


// reducers

const dashboardId = handleActions({
    [INITIALIZE]: { next: (state) => null },
    [SET_DASHBOARD_ID]: { next: (state, { payload }) => payload }
}, null);

const isEditing = handleActions({
    [INITIALIZE]: { next: (state) => false },
    [SET_EDITING_DASHBOARD]: { next: (state, { payload }) => payload }
}, false);

const cards = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => ({ ...payload.entities.card }) }
}, {});

const cardList = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => payload.result },
    [DELETE_CARD]: { next: (state, { payload }) => state }
}, null);

const dashboards = handleActions({
    [FETCH_DASHBOARD]: { next: (state, { payload }) => ({ ...state, ...payload.entities.dashboard }) },
    [SET_DASHBOARD_ATTRIBUTES]: {
        next: (state, { payload: { id, attributes } }) => ({
            ...state,
            [id]: { ...state[id], ...attributes, isDirty: true }
        })
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
        ...state, [dashcard.dashboard_id]: { ...state[dashcard.dashboard_id], ordered_cards: [...state[dashcard.dashboard_id].ordered_cards, dashcard.id] }
    }),
}, {});

const dashcards = handleActions({
    [FETCH_DASHBOARD]:  { next: (state, { payload }) => ({ ...state, ...payload.entities.dashcard }) },
    [SET_DASHCARD_ATTRIBUTES]: {
        next: (state, { payload: { id, attributes } }) => ({
            ...state,
            [id]: { ...state[id], ...attributes, isDirty: true }
        })
    },
    [SET_DASHCARD_VISUALIZATION_SETTING]: {
        next: (state, { payload: { id, key, value } }) =>
            i.chain(state)
                .assocIn([id, "visualization_settings", key], value)
                .assocIn([id, "isDirty"], true)
                .value()
    },
    [SET_DASHCARD_VISUALIZATION_SETTINGS]: {
        next: (state, { payload: { id, settings } }) =>
            i.chain(state)
                .assocIn([id, "visualization_settings"], settings)
                .assocIn([id, "isDirty"], true)
                .value()
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
        ...state,
        [dashcard.id]: { ...dashcard, isAdded: true, justAdded: true }
    }),
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId }}) => ({
        ...state,
        [dashcardId]: { ...state[dashcardId], isRemoved: true }
    }),
    [MARK_NEW_CARD_SEEN]: (state, { payload: dashcardId }) => ({
        ...state,
        [dashcardId]: { ...state[dashcardId], justAdded: false }
    })
}, {});

const editingParameterId = handleActions({
    [SET_EDITING_PARAMETER_ID]: { next: (state, { payload }) => payload }
}, null);

const revisions = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload: { entity, id, revisions } }) => ({ ...state, [entity+'-'+id]: revisions })}
}, {});

const dashcardData = handleActions({
    // clear existing dashboard data when loading a dashboard
    [INITIALIZE]: { next: (state) => ({}) },
    [FETCH_CARD_DATA]: { next: (state, { payload: { dashcard_id, card_id, result }}) =>
        i.assocIn(state, [dashcard_id, card_id], result)
    },
    [CLEAR_CARD_DATA]: { next: (state, { payload: { cardId, dashcardId }}) =>
        i.assocIn(state, [dashcardId, cardId])
    },
    [UPDATE_DASHCARD_ID]: { next: (state, { payload: { oldDashcardId, newDashcardId }}) =>
        i.chain(state)
            .assoc(newDashcardId, state[oldDashcardId])
            .dissoc(oldDashcardId)
            .value()
    }
}, {});

const cardDurations = handleActions({
    [FETCH_CARD_DURATION]: { next: (state, { payload: { id, result }}) => ({ ...state, [id]: result }) }
}, {});

const parameterValues = handleActions({
    [INITIALIZE]: { next: () => ({}) }, // reset values
    [SET_PARAMETER_VALUE]: { next: (state, { payload: { id, value }}) => i.assoc(state, id, value) },
    [REMOVE_PARAMETER]: { next: (state, { payload: { id }}) => i.dissoc(state, id) }
}, {});

const dashboardListing = handleActions({
    [FETCH_DASHBOARDS]: (state, { payload }) => payload,
    [CREATE_DASHBOARD]: (state, { payload }) => state.concat(payload),
    [DELETE_DASHBOARD]: (state, { payload }) => state.filter(d => d.id !== payload),
    [SAVE_DASHBOARD]:   (state, { payload }) => state.map(d => d.id === payload.id ? payload : d),
    [UPDATE_DASHBOARD]: (state, { payload }) => state.map(d => d.id === payload.id ? payload : d),
}, []);

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
    cardDurations,
    parameterValues,
    dashboardListing
});
