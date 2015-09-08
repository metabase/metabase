"use strict";

import _ from "underscore";
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

// resource wrappers
const ActivityApi = new AngularResourceProxy("Activity", ["list"]);
const CardApi = new AngularResourceProxy("Card", ["list"]);
const MetadataApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata"]);

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
export const SET_CARDS_FILTER = 'SET_CARDS_FILTER';
export const FETCH_ACTIVITY = 'FETCH_ACTIVITY';
export const FETCH_CARDS = 'FETCH_CARDS';
export const FETCH_DATABASES = 'FETCH_DATABASES';
export const FETCH_DATABASE_METADATA = 'FETCH_DATABASE_METADATA';


// action creators

export const setSelectedTab = createAction(SET_SELECTED_TAB);

export const setCardsFilter = createThunkAction(SET_CARDS_FILTER, function(filterDef) {
    return function(dispatch, getState) {
        let {database, table} = filterDef;

        if (database && !table) {
            // if we have a new database then fetch its metadata
            dispatch(fetchDatabaseMetadata(database));
        } else if (database && table) {
            // if we have a new table then refetch the cards
            dispatch(fetchCards('table', table));
        }

        return filterDef;
    };
});

export const fetchActivity = createThunkAction(FETCH_ACTIVITY, function() {
    return async function(dispatch, getState) {
        let activityItems = await ActivityApi.list();
        for (var ai of activityItems) {
            ai.timestamp = moment(ai.timestamp);
            ai.hasLinkableModel = function() {
                return (_.contains(["card", "dashboard"], this.model));
            };
        }
        return normalize(activityItems, arrayOf(activity));
    };
});

export const fetchCards = createThunkAction(FETCH_CARDS, function(filterMode, filterModelId) {
    return async function(dispatch, getState) {
        let cards = await CardApi.list({'filterMode' : filterMode, 'model_id' : filterModelId });
        for (var c of cards) {
            c.created_at = moment(c.created_at);
            c.updated_at = moment(c.updated_at);
            c.icon = c.display ? 'illustration_visualization_' + c.display : null;
        }
        return normalize(cards, arrayOf(card));
    };
});

export const fetchDatabases = createThunkAction(FETCH_DATABASES, function() {
    return async function(dispatch, getState) {
        let databases = await MetadataApi.db_list();
        return databases;
    };
});

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(database_id) {
    return async function(dispatch, getState) {
        let metadata = await MetadataApi.db_metadata({'dbId': database_id});
        return metadata;
    };
});

// fetch recent items (user)
// fetch table list (database)

