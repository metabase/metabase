import { createSelector } from "@reduxjs/toolkit";

import { getUser } from "metabase/current-user";
import type { State } from "metabase/redux/store";

export const canManageSubscriptions = createSelector(
  (state: State) => getUser(state),
  (user) => user?.permissions?.can_access_subscription ?? false,
);

export const canAccessSettings = createSelector(
  (state: State) => getUser(state),
  (user) => user?.permissions?.can_access_setting ?? false,
);
