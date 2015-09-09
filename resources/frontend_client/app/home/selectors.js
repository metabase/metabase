"use strict";

import { createSelector } from 'reselect';


const selectedTabSelector         = state => state.selectedTab;
const cardsFilterSelector         = state => state.cardsFilter;

const activitySelector            = state => state.activity;
const activityIdListSelector      = state => state.activityIdList;

const recentViewsSelector         = state => state.recentViews;

const cardsSelector               = state => state.cards;
const cardIdListSelector          = state => state.cardIdList;

const databasesSelector           = state => state.databases;
const databaseMetadataSelector    = state => state.databaseMetadata;


const activityListSelector = createSelector(
    [activityIdListSelector, activitySelector],
    (activityIdList, activity) => activityIdList && activityIdList.map(id => activity[id])
);

const cardListSelector = createSelector(
    [cardIdListSelector, cardsSelector],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

// our master selector which combines all of our partial selectors above
export const homepageSelectors = createSelector(
	[selectedTabSelector, cardsFilterSelector, activityListSelector, recentViewsSelector, cardListSelector, databasesSelector, databaseMetadataSelector],
	(selectedTab, cardsFilter, activity, recentViews, cards, databases, databaseMetadata) => ({selectedTab, cardsFilter, activity, recentViews, cards, databases, databaseMetadata})
);