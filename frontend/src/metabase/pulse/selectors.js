import { createSelector } from "reselect";
import _ from "underscore";

export const getEditingPulse = state => state.pulse.editingPulse;

export const getPulseFormInput = state => state.pulse.formInput;

export const hasLoadedChannelInfoSelector = createSelector(
  [getPulseFormInput],
  formInput => !!formInput.channels,
);
export const hasConfiguredAnyChannelSelector = createSelector(
  [getPulseFormInput],
  formInput =>
    (formInput.channels &&
      _.some(Object.values(formInput.channels), c => c.configured)) ||
    false,
);
export const hasConfiguredEmailChannelSelector = createSelector(
  [getPulseFormInput],
  formInput =>
    (formInput.channels &&
      _.some(
        Object.values(formInput.channels),
        c => c.type === "email" && c.configured,
      )) ||
    false,
);

export const getPulseCardPreviews = state => state.pulse.cardPreviews;

export const getPulseId = (state, props) =>
  props.params.pulseId ? parseInt(props.params.pulseId) : null;
