
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

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

export const editPulseSelectors = createSelector(
    [editingPulseSelector, cardsSelector, cardListSelector],
    (pulse, cards, cardList) => ({ pulse, cards, cardList })
);
