import { createSelector } from "reselect";

export const getUser = state => state.currentUser;

export const getUserId = createSelector([getUser], user => user?.id);

export const getUserIsAdmin = createSelector(
  [getUser],
  user => (user && user.is_superuser) || false,
);

export const getUserAttributes = createSelector(
  [getUser],
  user => (user && user.login_attributes) || [],
);

export const getUserPersonalCollectionId = createSelector(
  [getUser],
  user => (user && user.personal_collection_id) || null,
);
