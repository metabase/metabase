import { createSelector } from "reselect";

export const getUser = state => state.currentUser;

export const getUserIsAdmin = createSelector(
  [getUser],
  user => (user && user.is_superuser) || false,
);

export const getUserPersonalCollectionId = createSelector(
  [getUser],
  user => (user && user.personal_collection_id) || null,
);

export const getUserDefaultCollectionId = createSelector(
  [getUser, getUserIsAdmin, getUserPersonalCollectionId],
  (user, isAdmin, personalCollectionId) =>
    isAdmin ? null : personalCollectionId,
);
