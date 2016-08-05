
import { createSelector } from 'reselect';

const pulsesSelector = state => state.pulse.pulses;
const pulseIdListSelector = state => state.pulse.pulseList;

const pulseListSelector = createSelector(
    [pulseIdListSelector, pulsesSelector],
    (pulseIdList, pulses) => pulseIdList && pulseIdList.map(id => pulses[id])
);

const editingPulseSelector = state => state.pulse.editingPulse;

const cardsSelector        = state => state.pulse.cards
const cardIdListSelector   = state => state.pulse.cardList

const usersSelector        = state => state.pulse.users

const formInputSelector    = state => state.pulse.formInput

const cardPreviewsSelector = state => state.pulse.cardPreviews

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

const userListSelector = createSelector(
    [usersSelector],
    (users) => Object.values(users)
);

const getPulseId = (state, props) => props.params.pulseId ? parseInt(props.params.pulseId) : null;

// LIST
export const listPulseSelectors = createSelector(
    [getPulseId, pulseListSelector, formInputSelector],
    (pulseId, pulses, formInput) => ({ pulseId, pulses, formInput })
);

// EDIT
export const editPulseSelectors = createSelector(
    [getPulseId, editingPulseSelector, cardsSelector, cardListSelector, cardPreviewsSelector, userListSelector, formInputSelector],
    (pulseId, pulse, cards, cardList, cardPreviews, userList, formInput) => ({ pulseId, pulse, cards, cardList, cardPreviews, userList, formInput})
);
