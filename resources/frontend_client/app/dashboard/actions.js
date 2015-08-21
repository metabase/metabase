"use strict";

import { combineReducers } from "redux";
import { createAction } from "redux-actions";
import { normalize, Schema, arrayOf } from "normalizr";

import moment from "moment";

// HACK: just use our Angular resources for now
function AngularResourceProxy(serviceName, methods) {
    methods.forEach((methodName) => {
        this[methodName] = function(...args) {
            let service = angular.element(document.querySelector("body")).injector().get(serviceName);
            return service[methodName](...args).$promise;
        }
    });
}

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
function createThunkAction(actionType, actionThunkCreator) {
    return function(...actionArgs) {
        var thunk = actionThunkCreator(...actionArgs);
        return async function(dispatch, getState) {
            try {
                let payload = await thunk(dispatch, getState);
                dispatch({ type: actionType, payload });
            } catch (error) {
                dispatch({ type: actionType, payload: error, error: true });
                throw error;
            }
        }
    }
}

// normalizr schemas
const dashcard = new Schema('dashcard');
const card = new Schema('card');
const dashboard = new Schema('dashboard');
dashboard.define({
  ordered_cards: arrayOf(dashcard)
});

// action constants
export const SELECT_DASHBOARD = 'SELECT_DASHBOARD';
export const SET_EDITING_DASHBOARD = 'SET_EDITING';

export const FETCH_CARDS = 'FETCH_CARDS';
export const DELETE_CARD = 'DELETE_CARD';

export const FETCH_DASHBOARD = 'FETCH_DASHBOARD';
export const SET_DASHBOARD_ATTRIBUTES = 'SET_DASHBOARD_ATTRIBUTES';
export const SAVE_DASHBOARD = 'SAVE_DASHBOARD';

export const ADD_CARD_TO_DASH = 'ADD_CARD_TO_DASH';
export const REMOVE_CARD_FROM_DASH = 'REMOVE_CARD_FROM_DASH';
export const SET_DASHCARD_ATTRIBUTES = 'SET_DASHCARD_ATTRIBUTES';
export const SAVE_DASHCARD = 'SAVE_DASHCARD';

export const FETCH_DASHCARD_DATASET = 'FETCH_DASHCARD_DATASET';

// resource wrappers
const Dashboard = new AngularResourceProxy("Dashboard", ["get", "update", "reposition_cards", "addcard", "removecard"]);
const Metabase = new AngularResourceProxy("Metabase", ["dataset"]);
const Card = new AngularResourceProxy("Card", ["list", "delete"]);

// action creators
export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);
export const setDashboardAttributes = createAction(SET_DASHBOARD_ATTRIBUTES);
export const setDashCardAttributes = createAction(SET_DASHCARD_ATTRIBUTES);

export const fetchCards = createThunkAction(FETCH_CARDS, function(filterMode = "all") {
    return async function(dispatch, getState) {
        let cards = await Card.list({ filterMode });
        for (var c of cards) {
            c.updated_at = moment(c.updated_at);
            c.icon = c.display ? 'illustration_visualization_' + c.display : null;
        }
        return normalize(cards, arrayOf(card));
    };
});

export const deleteCard = createThunkAction(DELETE_CARD, function(cardId) {
    return async function(dispatch, getState) {
        let result = await Card.delete({ cardId });
        return cardId;
    };
});

export const addCardToDashboard = function({ dashId, cardId }) {
    return function(dispatch, getState) {
        let id = Math.random();
        dispatch(createAction(ADD_CARD_TO_DASH)({
            id: id,
            dashboard_id: dashId,
            card_id: cardId,
            card: getState().cards[cardId],
            col: 0,
            row: 0,
            sizeX: 2,
            sizeY: 2,
            isAdded: true
        }));
    };
}

export const removeCardFromDashboard = createAction(REMOVE_CARD_FROM_DASH);

export const fetchDashCardData = createThunkAction(FETCH_DASHCARD_DATASET, function(id) {
    return async function(dispatch, getState) {
        let dashcard = getState().dashcards[id];
        let result = await timeout(Metabase.dataset(dashcard.card.dataset_query), 10000);
        return { id, result };
    };
});

export const fetchDashboard = createThunkAction(FETCH_DASHBOARD, function(id) {
    return async function(dispatch, getState) {
        let result = await Dashboard.get({ dashId: id });
        return normalize(result, { dashboard: dashboard });
    };
});

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashId) {
    return async function(dispatch, getState) {
        let { dashboards, dashcards } = getState();
        let dashboard = {
            ...dashboards[dashId],
            ordered_cards: dashboards[dashId].ordered_cards.map(dashcardId => dashcards[dashcardId])
        };

        // remove isRemoved dashboards
        var removedDashcards = await * dashboard.ordered_cards
            .filter(dc => dc.isRemoved && !dc.isAdded)
            .map(dc => Dashboard.removecard({ dashId: dashboard.id, dashcardId: dc.id }));

        // add isAdded dashboards
        var updatedDashcards = await * dashboard.ordered_cards
            .filter(dc => !dc.isRemoved)
            .map(async dc => {
                if (dc.isAdded) {
                    var result = await Dashboard.addcard({ dashId, cardId: dc.card_id })
                    return { ...result, col: dc.col, row: dc.row, sizeX: dc.sizeX, sizeY: dc.sizeY }
                } else {
                    return dc;
                }
            });

        // update the dashboard itself
        var updateResult = await Dashboard.update(dashboard);

        // reposition the cards
        var dashcardResult = await Dashboard.reposition_cards({ dashId: dashId, cards: updatedDashcards })
        if (dashcardResult.status === "ok") {
            return updateResult;
        } else {
            throw new Error(dashcardResult.status);
        }
    };
});

// promise helpers

// if a promise doesn't resolve/reject within a given duration it will reject
function timeout(promise, duration, error) {
    return new Promise((resolve, reject) => {
        promise.then(resolve, reject);
        setTimeout(() => reject(error || new Error("Operation timed out")), duration);
    });
}

// returns a promise that resolves after a given duration
function delay(duration) {
    return new Promise((resolve, reject) => setTimeout(resolve, duration));
}
