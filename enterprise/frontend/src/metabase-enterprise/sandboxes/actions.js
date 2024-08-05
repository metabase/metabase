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
        if (!payload || !payload.entityId) {
          return state;
        }

        const { entityId, metadata, groupId, value, permissionInfo } = payload;

        // if user is unsandboxing a specific table,
        // remove the specific table's sandbox data
        if (entityId.tableId !== undefined) {
          const key = getPolicyKeyFromParams({
            groupId,
            tableId: entityId.tableId,
          });
          const isTableSandboxed = key in state;
          const isUnsandboxingTable =
            isTableSandboxed &&
            permissionInfo.permission === DataPermission.VIEW_DATA &&
            value !== DataPermissionValue.SANDBOXED;

          if (isUnsandboxingTable) {
            return _.omit(state, key);
          } else {
            return state;
          }
        }

        if (entityId.databaseId !== null) {
          const database = metadata.databases?.[entityId.databaseId];
          const tables = database?.tables ?? [];
          // filter tables if there's a schema referenced in the entity id
          const entityTables = tables.filter(
            table =>
              !entityId.schemaName || table.schema_name === entityId.schemaName,
          );

          // delete 0 to N sandboxes present in the state
          const policyKeys = entityTables.map(table =>
            getPolicyKeyFromParams({ groupId, tableId: table.id }),
          );
          return _.omit(state, policyKeys);
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
