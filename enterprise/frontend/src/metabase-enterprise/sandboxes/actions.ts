import _ from "underscore";

import {
  LOAD_DATA_PERMISSIONS,
  SAVE_DATA_PERMISSIONS,
  UPDATE_DATA_PERMISSION,
  type UpdateDataPermissionPayload,
  updateDataPermission,
} from "metabase/admin/permissions/permissions";
import { DataPermissionType } from "metabase/admin/permissions/types";
import {
  combineReducers,
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/redux";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";

import type { RawGroupTableAccessPolicyParams } from "./types";
import { getPolicyKey, getPolicyKeyFromParams } from "./utils";

export const UPDATE_TABLE_SANDBOXING_PERMISSION =
  "metabase-enterprise/sandboxes/UPDATE_TABLE_SANDBOXING_PERMISSION";
export const updateTableSandboxingPermission = createThunkAction(
  UPDATE_TABLE_SANDBOXING_PERMISSION,
  (params: RawGroupTableAccessPolicyParams) => async (dispatch) => {
    return dispatch(
      updateDataPermission({
        ...params,
        permission: {
          type: DataPermissionType.ACCESS,
          permission: DataPermission.VIEW_DATA,
        },
        value: DataPermissionValue.SANDBOXED,
      }),
    );
  },
);

const UPDATE_POLICY = "metabase-enterprise/sandboxes/UPDATE_POLICY";
export const updatePolicy = createAction<GroupTableAccessPolicy>(UPDATE_POLICY);

// handleActions types the whole map with one payload generic, so handlers
// narrow this union structurally
type SandboxesReducerPayload =
  | GroupTableAccessPolicy
  | UpdateDataPermissionPayload
  | undefined;

const groupTableAccessPolicies = handleActions<
  Record<string, GroupTableAccessPolicy>,
  SandboxesReducerPayload
>(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: () => ({}),
    },
    [SAVE_DATA_PERMISSIONS]: {
      next: () => ({}),
    },
    [UPDATE_POLICY]: {
      next: (state, { payload }) => {
        // never hit at runtime; narrows the map-wide payload union to this
        // action's payload, a policy
        if (!payload || !("table_id" in payload)) {
          return state;
        }
        const key = getPolicyKey(payload);
        return {
          ...state,
          [key]: payload,
        };
      },
    },
    [UPDATE_DATA_PERMISSION]: {
      next: (state, { payload }) => {
        if (!payload || !("entityId" in payload) || !payload.entityId) {
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
            (table) =>
              !entityId.schemaName || table.schema_name === entityId.schemaName,
          );

          // delete 0 to N sandboxes present in the state
          const policyKeys = entityTables.map((table) =>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  groupTableAccessPolicies,
});
