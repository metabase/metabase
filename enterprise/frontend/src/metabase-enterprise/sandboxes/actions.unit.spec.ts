import { UPDATE_DATA_PERMISSION } from "metabase/admin/permissions/permissions";
import { DataPermission, DataPermissionValue } from "metabase-types/api";

import reducer from "./actions";

const groupId = 1;
const databaseId = 2;
const tableId = 10;
const policyKey = `${groupId}:${tableId}`;

const sandboxPolicy = {
  group_id: groupId,
  table_id: tableId,
  card_id: null,
  attribute_remappings: {},
};

const initialState = {
  groupTableAccessPolicies: { [policyKey]: sandboxPolicy },
};

const updateDataPermissionAction = (payload: {
  permission: DataPermission;
  value: DataPermissionValue;
}) => ({
  type: UPDATE_DATA_PERMISSION,
  payload: {
    groupId,
    entityId: { databaseId, tableId },
    metadata: {},
    value: payload.value,
    permissionInfo: { permission: payload.permission },
  },
});

describe("groupTableAccessPolicies UPDATE_DATA_PERMISSION (metabase#46450)", () => {
  it("keeps a table's sandbox when editing a non-view-data permission (create-queries)", () => {
    const nextState = reducer(
      initialState,
      updateDataPermissionAction({
        permission: DataPermission.CREATE_QUERIES,
        value: DataPermissionValue.QUERY_BUILDER,
      }),
    );

    expect(nextState.groupTableAccessPolicies).toEqual({
      [policyKey]: sandboxPolicy,
    });
  });

  it("removes a table's sandbox when the view-data permission changes away from sandboxed", () => {
    const nextState = reducer(
      initialState,
      updateDataPermissionAction({
        permission: DataPermission.VIEW_DATA,
        value: DataPermissionValue.UNRESTRICTED,
      }),
    );

    expect(nextState.groupTableAccessPolicies).toEqual({});
  });
});
