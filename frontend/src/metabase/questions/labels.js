import {
  createAction,
  createThunkAction,
  mergeEntities,
} from "metabase/lib/redux";
import { reset } from "redux-form";
import { normalize, schema } from "normalizr";

import MetabaseAnalytics from "metabase/lib/analytics";

const label = new schema.Entity("labels");
import { LabelApi } from "metabase/services";

import _ from "underscore";

const LOAD_LABELS = "metabase/labels/LOAD_LABELS";
const EDIT_LABEL = "metabase/labels/EDIT_LABEL";
const SAVE_LABEL = "metabase/labels/SAVE_LABEL";
const DELETE_LABEL = "metabase/labels/DELETE_LABEL";

export const loadLabels = createThunkAction(LOAD_LABELS, () => {
  return async (dispatch, getState) => {
    let response = await LabelApi.list();
    return normalize(response, [label]);
  };
});

export const saveLabel = createThunkAction(SAVE_LABEL, values => {
  return async (dispatch, getState) => {
    try {
      let response;
      if (values.id == null) {
        MetabaseAnalytics.trackEvent("Labels", "Create");
        response = await LabelApi.create(values);
      } else {
        MetabaseAnalytics.trackEvent("Labels", "Update");
        response = await LabelApi.update(values);
      }
      if (response.id != null) {
        dispatch(reset("label"));
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

export const deleteLabel = createThunkAction(DELETE_LABEL, id => {
  return async (dispatch, getState) => {
    try {
      MetabaseAnalytics.trackEvent("Labels", "Delete");
      await LabelApi.delete({ id });
      return id;
    } catch (e) {
      // TODO: handle error
      return null;
    }
  };
});

export const editLabel = createAction(EDIT_LABEL);

const initialState = {
  entities: {
    labels: {},
  },
  labelIds: null,
  error: null,
  editing: null,
};

export default function(state = initialState, { type, payload, error }) {
  switch (type) {
    case LOAD_LABELS:
      if (error) {
        return { ...state, error: payload };
      } else {
        return {
          ...state,
          entities: mergeEntities(state.entities, payload.entities),
          labelIds: payload.result,
          error: null,
        };
      }
    case SAVE_LABEL:
      if (error || payload == null) {
        return state;
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          labels: { ...state.entities.labels, [payload.id]: payload },
        },
        labelIds: _.uniq([...state.labelIds, payload.id]),
        editing: state.editing === payload.id ? null : state.editing,
      };
    case EDIT_LABEL:
      return { ...state, editing: payload };
    case DELETE_LABEL:
      if (payload == null) {
        return state;
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          labels: { ...state.entities.labels, [payload]: undefined },
        },
        labelIds: state.labelIds.filter(id => id !== payload),
      };
    default:
      return state;
  }
}
