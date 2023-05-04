export const getActivity = state => state.home && state.home.activity;
export const getRecentViews = state => state.home && state.home.recentViews;
export const getLastSeenCollection = state =>
  state.home && state.home.lastSeenCollection;
export const getUser = state => state.currentUser;
