import i from "icepick";
import _ from "underscore";
import moment from "moment";

import { createAction } from "redux-actions";
import { handleActions, combineReducers, AngularResourceProxy, createThunkAction } from "metabase/lib/redux";
import { normalize, Schema, arrayOf } from "normalizr";

import MetabaseAnalytics from "metabase/lib/analytics";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";

import { fetchDatabaseMetadata } from "./metadata";

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
export const SET_EDITING_DASHBOARD = 'SET_EDITING';

export const FETCH_CARDS = 'FETCH_CARDS';
export const DELETE_CARD = 'DELETE_CARD';

export const FETCH_DASHBOARD = 'FETCH_DASHBOARD';
export const SET_DASHBOARD_ATTRIBUTES = 'SET_DASHBOARD_ATTRIBUTES';
export const SET_DASHCARD_VISUALIZATION_SETTING = 'SET_DASHCARD_VISUALIZATION_SETTING';
export const SAVE_DASHBOARD = 'SAVE_DASHBOARD';
export const DELETE_DASHBOARD = 'DELETE_DASHBOARD';

export const ADD_CARD_TO_DASH = 'ADD_CARD_TO_DASH';
export const REMOVE_CARD_FROM_DASH = 'REMOVE_CARD_FROM_DASH';
export const SET_DASHCARD_ATTRIBUTES = 'SET_DASHCARD_ATTRIBUTES';
export const SAVE_DASHCARD = 'SAVE_DASHCARD';

export const FETCH_CARD_DATA = 'FETCH_CARD_DATA';
export const FETCH_CARD_DURATION = 'FETCH_CARD_DURATION';
export const FETCH_REVISIONS = 'FETCH_REVISIONS';
export const REVERT_TO_REVISION = 'REVERT_TO_REVISION';

export const MARK_NEW_CARD_SEEN = 'MARK_NEW_CARD_SEEN';

export const FETCH_DATABASE_METADATA = 'FETCH_DATABASE_METADATA';

export const SET_EDITING_PARAMETER_ID = 'SET_EDITING_PARAMETER_ID';
export const ADD_PARAMETER = 'ADD_PARAMETER';
export const SET_PARAMETER_MAPPING = 'SET_PARAMETER_MAPPING';
export const SET_PARAMETER_NAME = 'SET_PARAMETER_NAME';
export const SET_PARAMETER_VALUE = 'SET_PARAMETER_VALUE';
export const SET_PARAMETER_DEFAULT_VALUE = 'SET_PARAMETER_DEFAULT_VALUE';

// resource wrappers
const DashboardApi = new AngularResourceProxy("Dashboard", ["get", "update", "delete", "reposition_cards", "addcard", "removecard"]);
const MetabaseApi = new AngularResourceProxy("Metabase", ["dataset", "dataset_duration", "db_metadata"]);
const CardApi = new AngularResourceProxy("Card", ["list", "update", "delete"]);
const RevisionApi = new AngularResourceProxy("Revision", ["list", "revert"]);

// action creators

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

export const addCardToDashboard = function({ dashId, cardId }) {
    return function(dispatch, getState) {
        const { dashboards, dashcards, cards } = getState().dashboard;
        const existingCards = dashboards[dashId].ordered_cards.map(id => dashcards[id]).filter(dc => !dc.isRemoved);
        const card = cards[cardId];
        const dashcard = {
            id: Math.random(), // temporary id
            dashboard_id: dashId,
            card_id: card.id,
            card: card,
            ...getPositionForNewDashCard(existingCards)
        };
        dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
        dispatch(fetchCardData(card, dashcard));
    };
}

export const removeCardFromDashboard = createAction(REMOVE_CARD_FROM_DASH);

const UPDATE_DASHCARD_ID = "UPDATE_DASHCARD_ID"
const updateDashcardId = createAction(UPDATE_DASHCARD_ID, (oldDashcardId, newDashcardId) => ({ oldDashcardId, newDashcardId }));

const CLEAR_CARD_DATA = "CLEAR_CARD_DATA";
export const clearCardData = createAction(CLEAR_CARD_DATA, (cardId, dashcardId) => ({ cardId, dashcardId }));

export async function fetchDataOrError(dataPromise) {
  try {
    return await dataPromise;
  }
  catch (error) {
    return { error };
  }
}

export const fetchCardData = createThunkAction(FETCH_CARD_DATA, function(card, dashcard, clearExisting = false) {
    return async function(dispatch, getState) {
        if (clearExisting) {
            dispatch(clearCardData(card.id, dashcard.id));
        }

        let result = null;

        // if we have a parameter, apply it to the card query before we execute
        let { dashboardId } = getState().router.params;
        let { dashboards, parameterValues } = getState().dashboard;

        let dashboard = dashboards[dashboardId];

        let parameters = [];
        if (dashboard && dashboard.parameters) {
            for (const parameter of dashboard.parameters) {
                let mapping = _.findWhere(dashcard && dashcard.parameter_mappings, { card_id: card.id, parameter_id: parameter.id });
                if (parameterValues[parameter.id] != null) {
                    parameters.push({
                        type: parameter.type,
                        target: mapping && mapping.target,
                        value: parameterValues[parameter.id]
                    });
                }
            }
        }

        let datasetQuery = {
            ...card.dataset_query,
            parameters
        };

        let slowCardTimer = setTimeout(() => {
            if (result === null) {
                dispatch(fetchCardDuration(card, datasetQuery));
            }
        }, DATASET_SLOW_TIMEOUT);

        result = await fetchDataOrError(Promise.reject({data: {message: 'test'}}));

        clearTimeout(slowCardTimer);
        return { dashcard_id: dashcard.id, card_id: card.id, result };
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

export const fetchDashboard = createThunkAction(FETCH_DASHBOARD, function(id, enableQueryParameters = true, enableDefaultParameters = true) {
    return async function(dispatch, getState) {
        let result = await DashboardApi.get({ dashId: id });
        if (result.parameters) {
            const { query } = getState().router.location;
            for (const parameter of result.parameters) {
                if (enableQueryParameters && query[parameter.slug] != null) {
                    dispatch(setParameterValue(parameter.id, query[parameter.slug]));
                } else if (enableDefaultParameters && parameter.default != null) {
                    dispatch(setParameterValue(parameter.id, parameter.default));
                }
            }
        }
        _.chain(result.ordered_cards)
            .map((dc) => [dc.card].concat(dc.series))
            .flatten()
            .map(card => card.dataset_query && card.dataset_query.database)
            .uniq()
            .each((dbId) => dispatch(fetchDatabaseMetadata(dbId)));

        return normalize(result, dashboard);
    };
});

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashId) {
    return async function(dispatch, getState) {
        let { dashboards, dashcards } = getState().dashboard;
        let dashboard = {
            ...dashboards[dashId],
            ordered_cards: dashboards[dashId].ordered_cards.map(dashcardId => dashcards[dashcardId])
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
                    return { ...result, col: dc.col, row: dc.row, sizeX: dc.sizeX, sizeY: dc.sizeY, series: dc.series, parameter_mappings: dc.parameter_mappings, isAdded: true }
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
            let { id, name, description, public_perms, parameters } = dashboard;
            dashboard = await DashboardApi.update({ id, name, description, public_perms, parameters });
        }

        // reposition the cards
        if (_.some(updatedDashcards, (dc) => dc.isDirty || dc.isAdded)) {
            let cards = updatedDashcards.map(({ id, card_id, row, col, sizeX, sizeY, series, parameter_mappings }) =>
                ({
                    id, card_id, row, col, sizeX, sizeY, series,
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
        dispatch(fetchDashboard(dashId, false, true)); // disable using query parameters when saving

        MetabaseAnalytics.trackEvent("Dashboard", "Update");

        return dashboard;
    };
});

export const deleteDashboard = createThunkAction(DELETE_DASHBOARD, function(dashId) {
    return async function(dispatch, getState) {
        await DashboardApi.delete({ dashId });
        MetabaseAnalytics.trackEvent("Dashboard", "Delete");
        return dashId;
    };
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

// reducers

const isEditing = handleActions({
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
        next: (state, { payload: { id, setting, value } }) =>
            i.chain(state)
                .assocIn([id, "card", "visualization_settings"].concat(setting), value)
                .assocIn([id, "card", "isDirty"], true)
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
    [SET_PARAMETER_VALUE]: { next: (state, { payload: { id, value }}) => i.assoc(state, id, value) }
}, {});

export default combineReducers({
    isEditing,
    cards,
    cardList,
    dashboards,
    dashcards,
    editingParameterId,
    revisions,
    dashcardData,
    cardDurations,
    parameterValues
});
