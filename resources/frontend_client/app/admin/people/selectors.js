"use strict";

import { createSelector } from 'reselect';

// our master selector which combines all of our partial selectors above
export const adminPeopleSelectors = createSelector(
	[state => state.showAddPersonModal,
	 state => state.showEditDetailsModal,
	 state => state.users],

	(showAddPersonModal,
	 showEditDetailsModal,
	 users) =>

	({showAddPersonModal,
	  showEditDetailsModal,
	  users})
);