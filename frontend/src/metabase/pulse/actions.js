import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";

import { PulseApi } from "metabase/services";
import Pulses from "metabase/entities/pulses";

import { getEditingPulse, getPulseFormInput } from "./selectors";
import { setErrorPage } from "metabase/redux/app";

import { getDefaultChannel, createChannel } from "metabase/lib/pulse";

export const SET_EDITING_PULSE = "SET_EDITING_PULSE";
export const UPDATE_EDITING_PULSE = "UPDATE_EDITING_PULSE";
export const SAVE_PULSE = "SAVE_PULSE";
export const SAVE_EDITING_PULSE = "SAVE_EDITING_PULSE";
export const DELETE_PULSE = "DELETE_PULSE";
export const TEST_PULSE = "TEST_PULSE";

export const FETCH_PULSE_FORM_INPUT = "FETCH_PULSE_FORM_INPUT";
export const FETCH_PULSE_CARD_PREVIEW = "FETCH_PULSE_CARD_PREVIEW";

export const setEditingPulse = createThunkAction(SET_EDITING_PULSE, function(
  id,
  initialCollectionId = null,
) {
  return async function(dispatch, getState) {
    if (id != null) {
      try {
        return Pulses.HACK_getObjectFromAction(
          await dispatch(Pulses.actions.fetch({ id })),
        );
      } catch (e) {
        console.error(e);
        dispatch(setErrorPage(e));
      }
    } else {
      // HACK: need a way to wait for form_input to finish loading
      const channels =
        getPulseFormInput(getState()).channels ||
        (await PulseApi.form_input()).channels;
      const defaultChannelSpec = getDefaultChannel(channels);
      return {
        name: null,
        cards: [],
        channels: defaultChannelSpec ? [createChannel(defaultChannelSpec)] : [],
        skip_if_empty: false,
        collection_id: initialCollectionId,
      };
    }
  };
});

export const updateEditingPulse = createAction(UPDATE_EDITING_PULSE);

export const saveEditingPulse = createThunkAction(
  SAVE_EDITING_PULSE,
  function() {
    return async function(dispatch, getState) {
      let editingPulse = getEditingPulse(getState());
      if (editingPulse.id != null) {
        return Pulses.HACK_getObjectFromAction(
          await dispatch(Pulses.actions.update(editingPulse)),
        );
      } else {
        return Pulses.HACK_getObjectFromAction(
          await dispatch(Pulses.actions.create(editingPulse)),
        );
      }
    };
  },
);

export const testPulse = createThunkAction(TEST_PULSE, function(pulse) {
  return async function(dispatch, getState) {
    return await PulseApi.test(pulse);
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
