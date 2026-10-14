import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import { getTokenFeature } from "metabase/settings";
import type { User } from "metabase-types/api";

import { currentUserApi } from "./api/current-user";
import { PLUGIN_APPLICATION_PERMISSIONS_SELECTORS } from "./plugins";

const selectCurrentUser: (state: State) => { data?: User } =
  currentUserApi.endpoints.getCurrentUser.select();

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

/**
 * A Data Analyst whose plan still includes the feature. Membership survives a
 * downgrade (the permissions it grants keep working), but the app areas the
 * role unlocks on its own pause until the feature returns.
 *
 * Mirrors entitled-data-analyst? in src/metabase/api/common.clj, minus the
 * superuser shortcut.
 */
export const getUserIsEntitledAnalyst = (state: State): boolean =>
  getUserIsAnalyst(state) &&
  Boolean(getTokenFeature(state, "advanced_permissions"));

export const canManageSubscriptions = createSelector(
  [
    getUserIsAdmin,
    (state) =>
      PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canManageSubscriptions(state),
  ],
  (isAdmin, canManageSubscriptions) => isAdmin || canManageSubscriptions,
);

export const canAccessSettings = createSelector(
  [
    getUserIsAdmin,
    (state) =>
      PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canAccessSettings(state),
  ],
  (isAdmin, canAccessSettings) => isAdmin || canAccessSettings,
);

export const canAccessDataModel = (state: State): boolean =>
  PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canAccessDataModel(state);

export const getUserAttributes = createSelector(
  [getUser],
  (user) => user?.attributes || {},
);

export const getUserPersonalCollectionId = createSelector(
  [getUser],
  (user) => user?.personal_collection_id,
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
