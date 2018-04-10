import { createSelector } from "reselect";
import _ from "underscore";

const pulsesSelector = state => state.pulse.pulses;
const pulseIdListSelector = state => state.pulse.pulseList;

const pulseListSelector = createSelector(
  [pulseIdListSelector, pulsesSelector],
  (pulseIdList, pulses) => pulseIdList && pulseIdList.map(id => pulses[id]),
);

const editingPulseSelector = state => state.pulse.editingPulse;

const cardsSelector = state => state.pulse.cards;
const cardIdListSelector = state => state.pulse.cardList;

const usersSelector = state => state.pulse.users;

export const formInputSelector = state => state.pulse.formInput;

export const hasLoadedChannelInfoSelector = createSelector(
  [formInputSelector],
  formInput => !!formInput.channels,
);
export const hasConfiguredAnyChannelSelector = createSelector(
  [formInputSelector],
  formInput =>
    (formInput.channels &&
      _.some(Object.values(formInput.channels), c => c.configured)) ||
    false,
);
export const hasConfiguredEmailChannelSelector = createSelector(
  [formInputSelector],
  formInput =>
    (formInput.channels &&
      _.some(
        Object.values(formInput.channels),
        c => c.type === "email" && c.configured,
      )) ||
    false,
);

const cardPreviewsSelector = state => state.pulse.cardPreviews;

const cardListSelector = createSelector(
  [cardIdListSelector, cardsSelector],
  (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id]),
);

export const userListSelector = createSelector([usersSelector], users =>
  Object.values(users),
);

const getPulseId = (state, props) =>
  props.params.pulseId ? parseInt(props.params.pulseId) : null;

// LIST
export const listPulseSelectors = createSelector(
  [
    getPulseId,
    pulseListSelector,
    formInputSelector,
    hasConfiguredAnyChannelSelector,
  ],
  (pulseId, pulses, formInput, hasConfiguredAnyChannel) => ({
    pulseId,
    pulses,
    formInput,
    hasConfiguredAnyChannel,
  }),
);

// EDIT
export const editPulseSelectors = createSelector(
  [
    getPulseId,
    editingPulseSelector,
    cardsSelector,
    cardListSelector,
    cardPreviewsSelector,
    userListSelector,
    formInputSelector,
  ],
  (pulseId, pulse, cards, cardList, cardPreviews, userList, formInput) => ({
    pulseId,
    pulse,
    cards,
    cardList,
    cardPreviews,
    userList,
    formInput,
  }),
);
