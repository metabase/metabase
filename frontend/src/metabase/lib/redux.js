import moment from "moment";
import _ from "underscore";
import { getIn } from "icepick";

import { setRequestState, clearRequestState } from "metabase/redux/requests";

// convienence
export { combineReducers } from "redux";
export { handleActions, createAction } from "redux-actions";

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
export function createThunkAction(actionType, actionThunkCreator) {
    function fn(...actionArgs) {
        var thunk = actionThunkCreator(...actionArgs);
        return async function(dispatch, getState) {
            try {
                let payload = await thunk(dispatch, getState);
                let dispatchValue = { type: actionType, payload };
                dispatch(dispatchValue);

                return dispatchValue;
            } catch (error) {
                dispatch({ type: actionType, payload: error, error: true });
                throw error;
            }
        }
    }
    fn.toString = () => actionType;
    return fn;
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

export function momentifyArraysTimestamps(array, keys) {
    return _.map(array, o => momentifyTimestamps(o, keys));
}

// turns into id indexed map
export const resourceListToMap = (resources) =>
    resources.reduce((map, resource) => ({ ...map, [resource.id]: resource }), {});

export const fetchData = async ({
    dispatch,
    getState,
    requestStatePath,
    existingStatePath,
    getData,
    reload
}) => {
    const existingData = getIn(getState(), existingStatePath);
    const statePath = requestStatePath.concat(['fetch']);
    try {
        const requestState = getIn(getState(), ["requests", ...statePath]);
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
    const existingData = getIn(getState(), existingStatePath);
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
