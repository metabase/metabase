import { createSelector } from 'reselect';


const selectedTabSelector         = state => state.selectedTab;
const cardsFilterSelector         = state => state.cardsFilter;

const activitySelector            = state => state.activity;
const recentViewsSelector         = state => state.recentViews;

const cardsSelector               = state => state.cards;

const databasesSelector           = state => state.databases;
const databaseMetadataSelector    = state => state.databaseMetadata;


// our master selector which combines all of our partial selectors above
export const homepageSelectors = createSelector(
	[selectedTabSelector, cardsFilterSelector, activitySelector, recentViewsSelector, cardsSelector, databasesSelector, databaseMetadataSelector],
	(selectedTab, cardsFilter, activity, recentViews, cards, databases, databaseMetadata) => ({selectedTab, cardsFilter, activity, recentViews, cards, databases, databaseMetadata})
);
