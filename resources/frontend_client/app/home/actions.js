"use strict";

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
const activity = new Schema('activity');
const card = new Schema('card');
// const database = new Schema('database');
// const table = new Schema('table');
// const user = new Schema('user');

// activity.define({
//     user: user,
//     database: database,
//     table: table
// })

// action constants
export const SET_SELECTED_TAB = 'SET_SELECTED_TAB';
export const FETCH_ACTIVITY = 'FETCH_ACTIVITY';
export const FETCH_CARDS = 'FETCH_CARDS';

// resource wrappers
const Activity = new AngularResourceProxy("Activity", ["list"]);
const Card = new AngularResourceProxy("Card", ["list"]);

// action creators

// select tab
export const setSelectedTab = createAction(SET_SELECTED_TAB);

export const fetchActivity = createThunkAction(FETCH_ACTIVITY, function() {
    return async function(dispatch, getState) {
        let activityItems = await Activity.list();
        return normalize(activityItems, arrayOf(activity));
    };
});

export const fetchCards = createThunkAction(FETCH_CARDS, function(filterMode, filterEntityId) {
    return async function(dispatch, getState) {
        let cards = await Card.list({'filterMode' : filterMode});
        for (var c of cards) {
            c.created_at = moment(c.created_at);
            c.updated_at = moment(c.updated_at);
            c.icon = c.display ? 'illustration_visualization_' + c.display : null;
        }
        return normalize(cards, arrayOf(card));
    };
});

// fetch recent items (user)
// fetch database list
// fetch table list (database)

