import _ from "underscore";

import { createSelector } from 'reselect';

const selectedDashboardSelector = state => state.selectedDashboard
const isEditingSelector         = state => state.isEditing;
const cardsSelector             = state => state.cards
const dashboardsSelector        = state => state.dashboards
const dashcardsSelector         = state => state.dashcards
const cardDataSelector          = state => state.cardData
const cardIdListSelector        = state => state.cardList
const revisionsSelector         = state => state.revisions

const dashboardSelector = createSelector(
    [selectedDashboardSelector, dashboardsSelector],
    (selectedDashboard, dashboards) => dashboards[selectedDashboard]
);

const dashboardCompleteSelector = createSelector(
    [dashboardSelector, dashcardsSelector, cardDataSelector],
    (dashboard, dashcards, cardData) => {
        if (dashboard) {
            dashboard = {
                ...dashboard,
                ordered_cards: dashboard.ordered_cards.map(id => ({
                    ...dashcards[id],
                    dataset: cardData[dashcards[id].card.id]
                })).filter(dc => !dc.isRemoved)
            };
        }
        return dashboard;
    }
)

const isDirtySelector = createSelector(
    [dashboardSelector, dashcardsSelector],
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

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

export const dashboardSelectors = createSelector(
    [isEditingSelector, isDirtySelector, selectedDashboardSelector, dashboardCompleteSelector, cardListSelector, revisionsSelector, cardDataSelector],
    (isEditing, isDirty, selectedDashboard, dashboard, cards, revisions, cardData) => ({ isEditing, isDirty, selectedDashboard, dashboard, cards, revisions, cardData })
);
