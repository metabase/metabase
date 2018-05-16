import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";
import { reset } from "redux-form";
import { replace } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import { CollectionsApi } from "metabase/services";
import Collections from "metabase/entities/collections";

// TODO: replace all of this with Collections entity

export const LOAD_COLLECTION = "metabase/collections/LOAD_COLLECTION";
export const LOAD_COLLECTIONS = "metabase/collections/LOAD_COLLECTIONS";
export const SAVE_COLLECTION = "metabase/collections/SAVE_COLLECTION";
export const SET_COLLECTION_ARCHIVED =
  "metabase/collections/SET_COLLECTION_ARCHIVED";

export const loadCollection = createAction(LOAD_COLLECTION, id =>
  CollectionsApi.get({ id }),
);
export const loadCollections = createAction(
  LOAD_COLLECTIONS,
  CollectionsApi.list,
);

export const saveCollection = createThunkAction(SAVE_COLLECTION, collection => {
  return async (dispatch, getState) => {
    try {
      if (!collection.description) {
        // description must be nil or non empty string
        collection = { ...collection, description: null };
      }
      let response;
      if (collection.id == null) {
        MetabaseAnalytics.trackEvent("Collections", "Create");
        response = await CollectionsApi.create(collection);
      } else {
        MetabaseAnalytics.trackEvent("Collections", "Update");
        response = await CollectionsApi.update(collection);
      }
      if (response.id != null) {
        dispatch(reset("collection"));
        // use `replace` so form url doesn't appear in history
        dispatch(replace(`/collection/${response.id}`));
      }
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
  };
});

export const setCollectionArchived = createThunkAction(
  SET_COLLECTION_ARCHIVED,
  (id, archived) => async (dispatch, getState) => {
    MetabaseAnalytics.trackEvent("Collections", "Set Archived", archived);
    // return await CollectionsApi.update({ id, archived: archived });
    return dispatch(Collections.actions.update({ id, archived: archived }));
  },
);

const collections = handleActions(
  {
    [LOAD_COLLECTIONS]: { next: (state, { payload }) => payload },
    [SAVE_COLLECTION]: {
      next: (state, { payload }) =>
        state.filter(c => c.id !== payload.id).concat(payload),
    },
    [SET_COLLECTION_ARCHIVED]: {
      next: (state, { payload }) => state.filter(c => c.id !== payload.id),
    },
  },
  [],
);

const error = handleActions(
  {
    [SAVE_COLLECTION]: {
      next: state => null,
      throw: (state, { error }) => error,
    },
  },
  null,
);

const collection = handleActions(
  {
    [LOAD_COLLECTION]: {
      next: (state, { payload }) => payload,
    },
    [SAVE_COLLECTION]: {
      next: (state, { payload }) => payload,
    },
  },
  null,
);

export default combineReducers({
  collection,
  collections,
  error,
});
