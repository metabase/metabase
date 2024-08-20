import type { PayloadAction } from "@reduxjs/toolkit";
import { createAction, createSlice } from "@reduxjs/toolkit";
import { push } from "react-router-redux";

import {
  LOAD_DATA_PERMISSIONS,
  SAVE_DATA_PERMISSIONS,
  UPDATE_DATA_PERMISSION,
} from "metabase/admin/permissions/permissions";
import {
  DataPermission,
  DataPermissionValue,
  type EntityId,
} from "metabase/admin/permissions/types";
import {
  DATABASES_BASE_PATH,
  GROUPS_BASE_PATH,
} from "metabase/admin/permissions/utils/urls";
import type { GroupId, Impersonation } from "metabase-types/api";

export const getImpersonatedPostAction = (
  entityId: EntityId,
  groupId: GroupId,
  view: "database" | "group",
) =>
  view === "database"
    ? push(
        `${DATABASES_BASE_PATH}/${entityId.databaseId}/impersonated/group/${groupId}`,
      )
    : push(
        `${GROUPS_BASE_PATH}/${groupId}/impersonated/database/${entityId.databaseId}`,
      );

const UPDATE_IMPERSONATION =
  "metabase-enterprise/advanced-permissions/UPDATE_IMPERSONATION";
export const updatePolicy = createAction(UPDATE_IMPERSONATION);

export interface AdvancedPermissionsState {
  impersonations: Impersonation[];
}

const initialState: AdvancedPermissionsState = {
  impersonations: [],
};

export const advancedPermissionsSlice = createSlice({
  initialState,
  name: "impersonations",
  reducers: {
    updateImpersonation(state, { payload }: PayloadAction<Impersonation>) {
      const impersonationIndex = state.impersonations.findIndex(
        impersonation =>
          impersonation.db_id === payload.db_id &&
          impersonation.group_id === payload.group_id,
      );

      if (impersonationIndex >= 0) {
        state.impersonations[impersonationIndex] = payload;
      } else {
        state.impersonations.push(payload);
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(LOAD_DATA_PERMISSIONS, () => initialState)
      .addCase(SAVE_DATA_PERMISSIONS, () => initialState)
      .addCase(UPDATE_DATA_PERMISSION, (state, { payload }: any) => {
        if (payload?.value === DataPermissionValue.IMPERSONATED) {
          return state;
        }

        if (payload?.permissionInfo?.permission === DataPermission.VIEW_DATA) {
          state.impersonations = state.impersonations.filter(
            impersonation =>
              impersonation.group_id !== payload.groupId &&
              impersonation.db_id !== payload.entityId.databaseId,
          );
        }
        return state;
      });
  },
});

export const { updateImpersonation } = advancedPermissionsSlice.actions;
