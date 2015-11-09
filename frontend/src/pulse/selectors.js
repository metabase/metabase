
import { createSelector } from 'reselect';

// LIST

const pulsesSelector = state => state.pulses;
const pulseIdListSelector = state => state.pulseList;

const pulseListSelector = createSelector(
    [pulseIdListSelector, pulsesSelector],
    (pulseIdList, pulses) => pulseIdList && pulseIdList.map(id => pulses[id])
);

export const listPulseSelectors = createSelector(
    [pulseListSelector],
    (pulses) => ({ pulses })
);

// EDIT

const editingPulseSelector = state => state.editingPulse;

const cardsSelector        = state => state.cards
const cardIdListSelector   = state => state.cardList

const usersSelector        = state => state.users

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

const userListSelector = createSelector(
    [usersSelector],
    (users) => Object.values(users)
);

export const editPulseSelectors = createSelector(
    [editingPulseSelector, cardsSelector, cardListSelector, userListSelector],
    (pulse, cards, cardList, userList) => ({ pulse, cards, cardList, userList })
);
