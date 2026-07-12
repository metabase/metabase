import { UPDATE_DATA_PERMISSION } from "metabase/admin/permissions/permissions";
import {
  DataPermission,
  DataPermissionValue,
  type Impersonation,
} from "metabase-types/api";

import { advancedPermissionsSlice } from "./reducer";

const { reducer } = advancedPermissionsSlice;

const groupId = 1;
const databaseId = 2;

const impersonation: Impersonation = {
  db_id: databaseId,
  group_id: groupId,
  attribute: "role",
};

const initialState = { impersonations: [impersonation] };

const updateDataPermissionAction = (payload: {
  permission: DataPermission;
  value: DataPermissionValue;
}) => ({
  type: UPDATE_DATA_PERMISSION,
  payload: {
    groupId,
    entityId: { databaseId },
    metadata: {},
    value: payload.value,
    permissionInfo: { permission: payload.permission },
  },
});

describe("advancedPermissionsSlice UPDATE_DATA_PERMISSION (metabase#46450)", () => {
  it("keeps an existing impersonation when editing a non-view-data permission (create-queries)", () => {
    const nextState = reducer(
      initialState,
      updateDataPermissionAction({
        permission: DataPermission.CREATE_QUERIES,
        value: DataPermissionValue.QUERY_BUILDER,
      }),
    );

    expect(nextState.impersonations).toEqual([impersonation]);
  });

  it("removes the impersonation when the view-data permission for the same group/db changes away from impersonated", () => {
    const nextState = reducer(
      initialState,
      updateDataPermissionAction({
        permission: DataPermission.VIEW_DATA,
        value: DataPermissionValue.UNRESTRICTED,
      }),
    );

    expect(nextState.impersonations).toEqual([]);
  });
});
