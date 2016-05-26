/* @flow-weak */

import _ from "underscore";

import { createSelector } from 'reselect';

export const getSelectedDashboard = state => state.selectedDashboard
export const getIsEditing         = state => state.isEditing;
export const getCards             = state => state.cards;
export const getDashboards        = state => state.dashboards;
export const getDashcards         = state => state.dashcards;
export const getCardData          = state => state.cardData;
export const getCardDurations     = state => state.cardDurations;
export const getCardIdList        = state => state.cardList;
export const getRevisions         = state => state.revisions;

export const getDatabases         = state => state.metadata.databases;

export const getDashboard = createSelector(
    [getSelectedDashboard, getDashboards],
    (selectedDashboard, dashboards) => dashboards[selectedDashboard]
);

export const getDashboardComplete = createSelector(
    [getDashboard, getDashcards],
    (dashboard, dashcards) => (dashboard && {
        ...dashboard,
        ordered_cards: dashboard.ordered_cards.map(id => dashcards[id]).filter(dc => !dc.isRemoved)
    })
);

export const getIsDirty = createSelector(
    [getDashboard, getDashcards],
    (dashboard, dashcards) => !!(
        dashboard && (
            dashboard.isDirty ||
            _.some(dashboard.ordered_cards, id => (
                !(dashcards[id].isAdded && dashcards[id].isRemoved) &&
                (dashcards[id].isDirty || dashcards[id].isAdded || dashcards[id].isRemoved)
            ))
        )
    )
);

export const getCardList = createSelector(
    [getCardIdList, getCards],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

export const getEditingParameter = (state) => state.editingParameter;

export const getIsEditingParameter = (state) => state.editingParameter != null;
