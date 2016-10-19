import moment from "moment";
import _ from "underscore";
import i from "icepick";

import { createStore as originalCreateStore, applyMiddleware, compose } from "redux";
import promise from 'redux-promise';
import thunk from "redux-thunk";
import createLogger from "redux-logger";

import { createHistory } from 'history';

import { reduxReactRouter } from 'redux-router';

import { setRequestState, clearRequestState } from "metabase/redux/requests";

// convienence
export { combineReducers } from "redux";
export { handleActions, createAction } from "redux-actions";

import { DEBUG } from "metabase/lib/debug";

let middleware = [thunk, promise];
if (DEBUG) {
    middleware.push(createLogger());
}

// common createStore with middleware applied
export const createStore = compose(
  applyMiddleware(...middleware),
  reduxReactRouter({ createHistory }),
  window.devToolsExtension ? window.devToolsExtension() : f => f
)(originalCreateStore);

// HACK: just use our Angular resources for now
export function AngularResourceProxy(serviceName, methods) {
    methods.forEach((methodName) => {
        this[methodName] = function(...args) {
            let service = angular.element(document.body).injector().get(serviceName);
            return service[methodName](...args).$promise;
        }
    });
}

export function angularPromise() {
    let $q = angular.element(document.body).injector().get("$q");
    return $q.defer();
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

//filters out angular cruft in resource list
export const cleanResources = (resources) => resources
    .filter(resource => resource.id !== undefined);

//filters out angular cruft and turns into id indexed map
export const resourceListToMap = (resources) => cleanResources(resources)
    .reduce((map, resource) => Object.assign({}, map, {[resource.id]: resource}), {});

//filters out angular cruft in resource
export const cleanResource = (resource) => Object.keys(resource)
    .filter(key => key.charAt(0) !== "$")
    .reduce((map, key) => Object.assign({}, map, {[key]: resource[key]}), {});

export const fetchData = async ({
    dispatch,
    getState,
    requestStatePath,
    existingStatePath,
    getData,
    reload
}) => {
    const existingData = i.getIn(getState(), existingStatePath);
    const statePath = requestStatePath.concat(['fetch']);
    try {
        const requestState = i.getIn(getState(), ["requests", ...statePath]);
        if (!requestState || requestState.error || reload) {
            dispatch(setRequestState({ statePath, state: "LOADING" }));
            const data = await getData();
            dispatch(setRequestState({ statePath, state: "LOADED" }));

            return data;
        }

        return existingData;
    }
    catch(error) {
        dispatch(setRequestState({ statePath, error }));
        console.error(error);
        return existingData;
    }
}

export const updateData = async ({
    dispatch,
    getState,
    requestStatePath,
    existingStatePath,
    // specify any request paths that need to be invalidated after this update
    dependentRequestStatePaths,
    putData
}) => {
    const existingData = i.getIn(getState(), existingStatePath);
    const statePath = requestStatePath.concat(['update']);
    try {
        dispatch(setRequestState({ statePath, state: "LOADING" }));
        const data = await putData();
        dispatch(setRequestState({ statePath, state: "LOADED" }));

        (dependentRequestStatePaths || [])
            .forEach(statePath => dispatch(clearRequestState({ statePath })));

        return data;
    }
    catch(error) {
        dispatch(setRequestState({ statePath, error }));
        console.error(error);
        return existingData;
    }
}

// for filtering non-DOM props from redux-form field objects
// https://github.com/erikras/redux-form/issues/1441
export const formDomOnlyProps = ({
    initialValue,
    autofill,
    onUpdate,
    valid,
    invalid,
    dirty,
    pristine,
    active,
    touched,
    visited,
    autofilled,
    error,
    defaultValue,
    ...domProps
}) => domProps
