"use strict";
/*global _*/

import { createSelector } from 'reselect';

const selectedDashboardSelector = state => state.selectedDashboard
const isEditingSelector         = state => state.isEditing;
const cardsSelector             = state => state.cards
const dashboardsSelector        = state => state.dashboards
const dashcardsSelector         = state => state.dashcards
const dashcardDatasetsSelector  = state => state.dashcardDatasets
const cardIdListSelector        = state => state.cardList

const dashboardSelector = createSelector(
    [selectedDashboardSelector, dashboardsSelector, dashcardsSelector, dashcardDatasetsSelector],
    (selectedDashboard, dashboards, dashcards, dashcardDatasets) => {
        var dashboard = dashboards[selectedDashboard];
        if (dashboard) {
            dashboard = {
                ...dashboard,
                ordered_cards: dashboard.ordered_cards.map(id => ({
                    ...dashcards[id],
                    dataset: dashcardDatasets[id]
                })).filter(dc => !dc.isRemoved)
            };
        }
        return dashboard;
    }
);

const isDirtySelector = createSelector(
  [dashboardSelector],
  dashboard => !!(dashboard && (dashboard.isDirty || _.some(dashboard.ordered_cards, dc => dc.isDirty)))
);

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList.map(id => cards[id])
);

export const dashboardSelectors = createSelector(
    [isEditingSelector, isDirtySelector, selectedDashboardSelector, dashboardSelector, cardListSelector],
    (isEditing, isDirty, selectedDashboard, dashboard, cards) => ({ isEditing, isDirty, selectedDashboard, dashboard, cards })
);
