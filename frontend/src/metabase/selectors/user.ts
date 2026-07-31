import { createSelector } from "@reduxjs/toolkit";

import { userApi } from "metabase/api/user";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import type { User } from "metabase-types/api";

// The current user lives in the `getCurrentUser` RTK Query cache — there is no
// user slice. `loadCurrentUser` (dispatched on app entry) populates it, and the
// user mutations in `metabase/api/user` patch it in place.
//
// The explicit annotation collapses the RTK-generated selector generics; left
// inferred, they leak into every consumer of `getUser` and push deeply-nested
// reducer files over TypeScript's instantiation-depth limit (TS2589).
const selectCurrentUser: (state: State) => { data?: User } =
  userApi.endpoints.getCurrentUser.select();

export const getUser = (state: State): User | null =>
  selectCurrentUser(state).data ?? null;

export const getUserId = createSelector([getUser], (user) => user?.id);

export const getUserIsAdmin = createSelector(
  [getUser],
  (user) => user?.is_superuser || false,
);

export const getUserIsAnalyst = createSelector(
  [getUser],
  (user) => !!user?.is_data_analyst,
);

export const canManageSubscriptions = createSelector(
  [
    getUserIsAdmin,
    (state) =>
      PLUGIN_APPLICATION_PERMISSIONS.selectors.canManageSubscriptions(state),
  ],
  (isAdmin, canManageSubscriptions) => isAdmin || canManageSubscriptions,
);

export const canAccessSettings = createSelector(
  [
    getUserIsAdmin,
    (state) =>
      PLUGIN_APPLICATION_PERMISSIONS.selectors.canAccessSettings(state),
  ],
  (isAdmin, canAccessSettings) => isAdmin || canAccessSettings,
);

export const getUserAttributes = createSelector(
  [getUser],
  (user) => user?.attributes || {},
);

export const getUserPersonalCollectionId = createSelector(
  [getUser],
  (user) => user?.personal_collection_id,
);

export const getUserTenantCollectionId = createSelector(
  [getUser],
  (user) => user?.tenant_collection_id,
);

export const canUserCreateQueries = createSelector(
  [getUser],
  (user) => user?.permissions?.can_create_queries ?? false,
);

export const canUserCreateNativeQueries = createSelector(
  [getUser],
  (user) => user?.permissions?.can_create_native_queries ?? false,
);

export const getUserCanWriteToCollections = createSelector(
  [getUser],
  (user) => user?.can_write_any_collection,
);

export const getIsTenantUser = createSelector(
  [getUser],
  (user) => user?.tenant_id != null,
);
