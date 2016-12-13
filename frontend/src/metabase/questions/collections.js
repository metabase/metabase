
import { createAction, createThunkAction, handleActions, combineReducers } from "metabase/lib/redux";
import { reset } from 'redux-form';
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import { CollectionsApi } from "metabase/services";

const LOAD_COLLECTIONS = 'metabase/collections/LOAD_COLLECTIONS';
const SAVE_COLLECTION = 'metabase/collections/SAVE_COLLECTION';
const DELETE_COLLECTION = 'metabase/collections/DELETE_COLLECTION';

export const loadCollections = createAction(LOAD_COLLECTIONS, CollectionsApi.list);

export const saveCollection = createThunkAction(SAVE_COLLECTION, (values) => {
    return async (dispatch, getState) => {
        try {
            let response;
            if (values.id == null) {
                MetabaseAnalytics.trackEvent("Collections", "Create");
                response = await CollectionsApi.create(values);
            } else {
                MetabaseAnalytics.trackEvent("Collections", "Update");
                response = await CollectionsApi.update(values);
            }
            if (response.id != null) {
                dispatch(reset("collection"));
            }
            dispatch(push("/questions"))
            return response;
        } catch (e) {
            // redux-form expects an object with either { field: error } or { _error: error }
            if (e.data && e.data.errors) {
                throw e.data.errors;
            } else if (e.data && e.data.message) {
                throw { _error: e.data.message };
            } else {
                throw { _error: "An unknown error occured" };
            }
        }
    }
});

export const deleteCollection = createThunkAction(DELETE_COLLECTION, (id) => {
    return async (dispatch, getState) => {
        try {
            MetabaseAnalytics.trackEvent("Collections", "Delete");
            await CollectionsApi.delete({ id });
            return id;
        } catch (e) {
            // TODO: handle error
            return null;
        }
    }
});

const collections = handleActions({
    [LOAD_COLLECTIONS]:  { next: (state, { payload }) => payload },
    [SAVE_COLLECTION]:   { next: (state, { payload }) => state.filter(c => c.id !== payload.id).concat(payload) },
    [DELETE_COLLECTION]: { next: (state, { payload }) => state.filter(c => c.id !== payload) }
}, []);

const error = handleActions({
    [SAVE_COLLECTION]: {
        next: (state) => null,
        throw: (state, { error }) => error
    }
}, null);

export default combineReducers({
    collections,
    error
});
