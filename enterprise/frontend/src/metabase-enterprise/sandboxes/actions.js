import { updateDataPermission } from "metabase/admin/permissions/permissions";
import { createThunkAction } from "metabase/lib/redux";

export const UPDATE_TABLE_SANDBOXING_PERMISSION =
  "metabase-enterprise/sandboxes/UPDATE_TABLE_SANDBOXING_PERMISSION";
export const updateTableSandboxingPermission = createThunkAction(
  UPDATE_TABLE_SANDBOXING_PERMISSION,
  params => async dispatch => {
    const { groupId, ...entityId } = params;
    return dispatch(
      updateDataPermission({
        groupId,
        permission: { type: "access", permission: "data" },
        value: "controlled",
        entityId,
      }),
    );
  },
);
