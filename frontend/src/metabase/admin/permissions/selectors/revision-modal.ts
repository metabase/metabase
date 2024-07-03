import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";

import { getIsDirty as getIsCollectionPemissionsDirty } from "./collection-permissions";
import { getIsDirty as getIsDataPemissionsDirty } from "./data-permissions/diff";

export const showRevisionChangedModal = createSelector(
  [
    getIsDataPemissionsDirty,
    getIsCollectionPemissionsDirty,
    (state: State) =>
      state.admin.permissions.hasRevisionChanged.hasChanged ||
      state.admin.permissions.hasCollectionRevisionChanged.hasChanged,
  ],

  (isDataPermsDirty, isCollPermsDirty, hasRevisionChanged) =>
    (isDataPermsDirty || isCollPermsDirty) && hasRevisionChanged,
);
