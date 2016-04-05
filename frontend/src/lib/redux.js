import moment from "moment";
import _ from "underscore";

import { createStore as originalCreateStore, applyMiddleware, compose } from "redux";
import promise from 'redux-promise';
import thunk from "redux-thunk";

import { createHistory } from 'history';
import { reduxReactRouter } from 'redux-router';

// convienence
export { combineReducers } from "redux";
export { handleActions } from "redux-actions";

// common createStore with middleware applied
export const createStore = compose(
  applyMiddleware(thunk, promise),
  reduxReactRouter({ createHistory })
)(originalCreateStore);

// HACK: just use our Angular resources for now
export function AngularResourceProxy(serviceName, methods) {
    methods.forEach((methodName) => {
        this[methodName] = function(...args) {
            let service = angular.element(document.querySelector("body")).injector().get(serviceName);
            return service[methodName](...args).$promise;
        }
    });
}

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
export function createThunkAction(actionType, actionThunkCreator) {
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

// turns string timestamps into moment objects
export function momentifyTimestamps(object, keys = ["created_at", "updated_at"]) {
    object = { ...object };
    for (let timestamp of keys) {
        if (timestamp in object) {
            object[timestamp] = moment(object[timestamp]);
        }
    }
    return object;
}

export function momentifyObjectsTimestamps(objects, keys) {
    return _.mapObject(objects, o => momentifyTimestamps(o, keys));
}
