import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";

import { getIsDataPermissionsDirty } from "./diff";

export const showRevisionChangedModal = createSelector(
  [
    getIsDataPermissionsDirty,
    (state: State) => state.admin.permissions.hasRevisionChanged.hasChanged,
  ],

  (isDirty, hasRevisionChanged) => isDirty && hasRevisionChanged,
);
