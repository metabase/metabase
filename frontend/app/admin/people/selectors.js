import { createSelector } from 'reselect';

// our master selector which combines all of our partial selectors above
export const adminPeopleSelectors = createSelector(
	[state => state.modal, state => state.users],
	(modal, users) => ({modal, users})
);
