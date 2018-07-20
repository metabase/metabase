import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import { normalize, schema } from "normalizr";

import { PulseApi, CardApi, UserApi } from "metabase/services";
import { formInputSelector } from "./selectors";

import { getDefaultChannel, createChannel } from "metabase/lib/pulse";

const card = new schema.Entity("card");
const pulse = new schema.Entity("pulse");
const user = new schema.Entity("user");

export const FETCH_PULSES = "FETCH_PULSES";
export const SET_EDITING_PULSE = "SET_EDITING_PULSE";
export const UPDATE_EDITING_PULSE = "UPDATE_EDITING_PULSE";
export const SAVE_PULSE = "SAVE_PULSE";
export const SAVE_EDITING_PULSE = "SAVE_EDITING_PULSE";
export const DELETE_PULSE = "DELETE_PULSE";
export const TEST_PULSE = "TEST_PULSE";

export const FETCH_CARDS = "FETCH_CARDS";
export const FETCH_USERS = "FETCH_USERS";
export const FETCH_PULSE_FORM_INPUT = "FETCH_PULSE_FORM_INPUT";
export const FETCH_PULSE_CARD_PREVIEW = "FETCH_PULSE_CARD_PREVIEW";

export const fetchPulses = createThunkAction(FETCH_PULSES, function() {
  return async function(dispatch, getState) {
    let pulses = await PulseApi.list();
    return normalize(pulses, [pulse]);
  };
});

export const setEditingPulse = createThunkAction(SET_EDITING_PULSE, function(
  id,
  initialCollectionId = null,
) {
  return async function(dispatch, getState) {
    if (id != null) {
      try {
        return await PulseApi.get({ pulseId: id });
      } catch (e) {}
    }
    // HACK: need a way to wait for form_input to finish loading
    const channels =
      formInputSelector(getState()).channels ||
      (await PulseApi.form_input()).channels;
    const defaultChannelSpec = getDefaultChannel(channels);
    return {
      name: null,
      cards: [],
      channels: defaultChannelSpec ? [createChannel(defaultChannelSpec)] : [],
      skip_if_empty: false,
      collection_id: initialCollectionId,
    };
  };
});

export const updateEditingPulse = createAction(UPDATE_EDITING_PULSE);

export const savePulse = createThunkAction(SAVE_PULSE, function(pulse) {
  return async function(dispatch, getState) {
    return await PulseApi.update(pulse);
  };
});

export const saveEditingPulse = createThunkAction(
  SAVE_EDITING_PULSE,
  function() {
    return async function(dispatch, getState) {
      let { pulse: { editingPulse } } = getState();
      if (editingPulse.id != null) {
        return await PulseApi.update(editingPulse);
      } else {
        return await PulseApi.create(editingPulse);
      }
    };
  },
);

export const deletePulse = createThunkAction(DELETE_PULSE, function(id) {
  return async function(dispatch, getState) {
    return await PulseApi.delete({ pulseId: id });
  };
});

export const testPulse = createThunkAction(TEST_PULSE, function(pulse) {
  return async function(dispatch, getState) {
    return await PulseApi.test(pulse);
  };
});

// NOTE: duplicated from dashboards/actions.js
export const fetchCards = createThunkAction(FETCH_CARDS, function(
  filterMode = "all",
) {
  return async function(dispatch, getState) {
    let cards = await CardApi.list({ f: filterMode });
    return normalize(cards, [card]);
  };
});

// NOTE: duplicated from admin/people/actions.js
export const fetchUsers = createThunkAction(FETCH_USERS, function() {
  return async function(dispatch, getState) {
    let users = await UserApi.list();
    return normalize(users, [user]);
  };
});

export const fetchPulseFormInput = createThunkAction(
  FETCH_PULSE_FORM_INPUT,
  function() {
    return async function(dispatch, getState) {
      return await PulseApi.form_input();
    };
  },
);

export const fetchPulseCardPreview = createThunkAction(
  FETCH_PULSE_CARD_PREVIEW,
  function(id) {
    return async function(dispatch, getState) {
      return await PulseApi.preview_card({ id: id });
    };
  },
);
