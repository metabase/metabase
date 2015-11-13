
import { createSelector } from 'reselect';

const pulsesSelector = state => state.pulses;
const pulseIdListSelector = state => state.pulseList;

const pulseListSelector = createSelector(
    [pulseIdListSelector, pulsesSelector],
    (pulseIdList, pulses) => pulseIdList && pulseIdList.map(id => pulses[id])
);

const editingPulseSelector = state => state.editingPulse;

const cardsSelector        = state => state.cards
const cardIdListSelector   = state => state.cardList

const usersSelector        = state => state.users

const formInputSelector    = state => state.formInput

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

const userListSelector = createSelector(
    [usersSelector],
    (users) => Object.values(users)
);

// LIST
export const listPulseSelectors = createSelector(
    [pulseListSelector, formInputSelector],
    (pulses, formInput) => ({ pulses, formInput })
);

// EDIT
export const editPulseSelectors = createSelector(
    [editingPulseSelector, cardsSelector, cardListSelector, userListSelector, formInputSelector],
    (pulse, cards, cardList, userList, formInput) => ({ pulse, cards, cardList, userList, formInput})
);
