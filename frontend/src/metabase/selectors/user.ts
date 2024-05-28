import { createSelector } from "@reduxjs/toolkit";

import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";
import type { State } from "metabase-types/store";

export const getUser = (state: State) => state.currentUser;

export const getUserId = createSelector([getUser], user => user?.id);

export const getUserIsAdmin = createSelector(
  [getUser],
  user => user?.is_superuser || false,
);

export const canManageSubscriptions = createSelector(
  [
    getUserIsAdmin,
    state =>
      PLUGIN_APPLICATION_PERMISSIONS.selectors.canManageSubscriptions(state),
  ],
  (isAdmin, canManageSubscriptions) => isAdmin || canManageSubscriptions,
);

export const getUserAttributes = createSelector(
  [getUser],
  user => user?.login_attributes || {},
);

export const getUserPersonalCollectionId = createSelector(
  [getUser],
  user => user?.personal_collection_id,
);
