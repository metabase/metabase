import _ from "lodash";

import {
  updateDataPermission,
  SAVE_DATA_PERMISSIONS,
  LOAD_DATA_PERMISSIONS,
  UPDATE_DATA_PERMISSION,
} from "metabase/admin/permissions/permissions";
import {
  DataPermission,
  DataPermissionValue,
  DataPermissionType,
} from "metabase/admin/permissions/types";
import {
  createThunkAction,
  createAction,
  handleActions,
  combineReducers,
  withRequestState,
} from "metabase/lib/redux";
import { GTAPApi } from "metabase/services";

import { getPolicyKeyFromParams, getPolicyKey } from "./utils";

export const FETCH_POLICY = "metabase-enterprise/sandboxes/FETCH_POLICY";
export const fetchPolicy = withRequestState(params => [
  "plugins",
  "sandboxesPlugin",
  "policies",
  getPolicyKeyFromParams(params),
])(
  createThunkAction(
    FETCH_POLICY,
    ({ groupId: group_id, tableId: table_id }) =>
      async () => {
        return await GTAPApi.list({ group_id, table_id });
      },
  ),
);

export const UPDATE_TABLE_SANDBOXING_PERMISSION =
  "metabase-enterprise/sandboxes/UPDATE_TABLE_SANDBOXING_PERMISSION";
export const updateTableSandboxingPermission = createThunkAction(
  UPDATE_TABLE_SANDBOXING_PERMISSION,
  params => async dispatch => {
    const { groupId, ...entityId } = params;
    return dispatch(
      updateDataPermission({
        groupId,
        permission: {
          type: DataPermissionType.ACCESS,
          permission: DataPermission.VIEW_DATA,
        },
        value: DataPermissionValue.SANDBOXED,
        entityId,
      }),
    );
  },
);

const UPDATE_POLICY = "metabase-enterprise/sandboxes/UPDATE_POLICY";
export const updatePolicy = createAction(UPDATE_POLICY);

const groupTableAccessPolicies = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: () => ({}),
    },
    [SAVE_DATA_PERMISSIONS]: {
      next: () => ({}),
    },
    [UPDATE_POLICY]: {
      next: (state, { payload }) => {
        const key = getPolicyKey(payload);
        return {
          ...state,
          [key]: payload,
        };
      },
    },
    [UPDATE_DATA_PERMISSION]: {
      next: (state, { payload }) => {
        if (payload.entityId.tableId === undefined) {
          return state;
        }

        const key = getPolicyKeyFromParams({
          groupId: payload.groupId,
          tableId: payload.entityId.tableId,
        });

        const isSandboxed = key in state;
        const isUnsandboxing = payload.value !== DataPermissionValue.SANDBOXED;

        if (isSandboxed && isUnsandboxing) {
          return _.omit(state, key);
        }

        return state;
      },
    },
  },
  {},
);

const originalGroupTableAccessPolicies = handleActions(
  {
    [FETCH_POLICY]: {
      next: (state, { payload }) => {
        const key = getPolicyKey(payload);
        return {
          ...state,
          [key]: payload,
        };
      },
    },
  },
  {},
);

export default combineReducers({
  originalGroupTableAccessPolicies,
  groupTableAccessPolicies,
});
