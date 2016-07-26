import { createSelector } from 'reselect';

// our master selector which combines all of our partial selectors above
export const adminPeopleSelectors = createSelector(
	[state => state.people.modal, state => state.people.users],
	(modal, users) => ({modal, users})
);
