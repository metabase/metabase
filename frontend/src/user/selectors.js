import { createSelector } from 'reselect';

// our master selector which combines all of our partial selectors above
export const selectors = createSelector(
	[state => state.tab, state => state.updatePasswordResult, state => state.updateUserResult],
	(tab, updatePasswordResult, updateUserResult) => ({tab, updatePasswordResult, updateUserResult})
);
