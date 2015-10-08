import { createSelector } from 'reselect';

export const homepageSelectors = createSelector(
	[state => state.activity,
	 state => state.recentViews],

	(activity, recentViews) => ({activity, recentViews})
);
