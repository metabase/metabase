import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";

import { getIsDirty } from "./diff";

export const showRevisionChangedModal = createSelector(
  [
    getIsDirty,
    (state: State) => state.admin.permissions.hasRevisionChanged.hasChanged,
  ],

  (isDirty, hasRevisionChanged) => isDirty && hasRevisionChanged,
);
