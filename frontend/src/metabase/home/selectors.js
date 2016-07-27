export const getActivity 		= (state) => state.home && state.home.activity
export const getRecentViews 	= (state) => state.home && state.home.recentViews
export const getUser 			= (state) => state.currentUser
export const getShowOnboarding 	= (state) => state.router && state.router.location && "new" in state.router.location.query
