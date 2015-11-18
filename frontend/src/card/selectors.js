import { createSelector } from 'reselect';


// our master selector which combines all of our partial selectors above
export const savedQuestionsSelectors = createSelector(
	[state => state.cardsFilter,
	 state => state.cards,
	 state => state.databases,
	 state => state.databaseMetadata],

	(cardsFilter, cards, databases, databaseMetadata) => ({cardsFilter, cards, databases, databaseMetadata})
);