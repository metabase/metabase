import _ from "underscore";

export const getEditingPulse = state => state.pulse.editingPulse;

export const getPulseFormInput = state => state.pulse?.formInput;

export const getPulseCardPreviews = state => state.pulse.cardPreviews;

export const getPulseId = (state, props) =>
  props.params.pulseId ? parseInt(props.params.pulseId) : null;

export const getPulseList = state => state.pulse.pulseList;
