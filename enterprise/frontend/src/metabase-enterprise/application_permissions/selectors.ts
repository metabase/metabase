import { createSelector } from "@reduxjs/toolkit";

import type { ApplicationPermissionsState } from "metabase/admin/permissions/application-permissions/types";

export const canManageSubscriptions = createSelector(
  (state: ApplicationPermissionsState) => state.currentUser,
  (user) => user?.permissions?.can_access_subscription ?? false,
);

export const canAccessSettings = createSelector(
  (state: ApplicationPermissionsState) => state.currentUser,
  (user) => user?.permissions?.can_access_setting ?? false,
);
