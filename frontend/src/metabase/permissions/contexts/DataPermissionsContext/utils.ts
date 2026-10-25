import { merge } from "icepick";
import _ from "underscore";

import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import type {
  AppliedDataPermissionUpdate,
  DataPermissionsDrafts,
  DatabaseId,
  GroupsPermissions,
  PermissionsDatabase,
  PermissionsGraph,
} from "metabase-types/api";

import { applyDataPermissionUpdate } from "../../utils/graph";
import { mergeGroupsPermissionsUpdates } from "../../utils/graph/partial-updates";

export type DataPermissionsState = {
  permissions: GroupsPermissions | null;
  originalPermissions: GroupsPermissions | null;
  revision: number | null;
  hasRevisionChanged: boolean;
  databasesWithTables: Record<DatabaseId, PermissionsDatabase>;
  drafts: DataPermissionsDrafts;
  saveError: string | null;
};

export type DataPermissionsAction =
  | { type: "graphLoaded"; graph: PermissionsGraph }
  | { type: "databaseLoaded"; database: PermissionsDatabase }
  | { type: "permissionUpdated"; update: AppliedDataPermissionUpdate }
  | {
      type: "draftsUpdated";
      updateDrafts: (drafts: DataPermissionsDrafts) => DataPermissionsDrafts;
    }
  | { type: "saved"; graph: PermissionsGraph; modifiedGroupIds: string[] }
  | { type: "saveFailed"; error: string }
  | { type: "saveErrorCleared" }
  | { type: "reset" };

const EMPTY_DRAFTS: DataPermissionsDrafts = {
  sandboxes: {},
  impersonations: [],
};

export const INITIAL_DATA_PERMISSIONS_STATE: DataPermissionsState = {
  permissions: null,
  originalPermissions: null,
  revision: null,
  hasRevisionChanged: false,
  databasesWithTables: {},
  drafts: EMPTY_DRAFTS,
  saveError: null,
};

const mergeLoadedPermissions = (
  permissions: GroupsPermissions | null,
  loadedPermissions: GroupsPermissions,
) =>
  permissions != null
    ? merge(loadedPermissions, permissions)
    : loadedPermissions;

export function dataPermissionsReducer(
  state: DataPermissionsState,
  action: DataPermissionsAction,
): DataPermissionsState {
  switch (action.type) {
    case "graphLoaded":
      return {
        ...state,
        permissions: mergeLoadedPermissions(
          state.permissions,
          action.graph.groups,
        ),
        originalPermissions: mergeLoadedPermissions(
          state.originalPermissions,
          action.graph.groups,
        ),
        revision: action.graph.revision,
        hasRevisionChanged:
          state.hasRevisionChanged ||
          (state.revision != null && state.revision !== action.graph.revision),
      };
    case "databaseLoaded":
      return {
        ...state,
        databasesWithTables: {
          ...state.databasesWithTables,
          [action.database.id]: action.database,
        },
      };
    case "permissionUpdated":
      if (state.permissions == null) {
        return state;
      }
      return {
        ...state,
        permissions: applyDataPermissionUpdate(
          state.permissions,
          action.update,
        ),
        databasesWithTables: {
          ...state.databasesWithTables,
          [action.update.database.id]: action.update.database,
        },
        drafts: PLUGIN_DATA_PERMISSIONS.updateDrafts.reduce(
          (drafts, updateDrafts) => updateDrafts(drafts, action.update),
          state.drafts,
        ),
      };
    case "draftsUpdated":
      return { ...state, drafts: action.updateDrafts(state.drafts) };
    case "saved":
      return {
        ...state,
        permissions: mergeGroupsPermissionsUpdates(
          state.permissions,
          action.graph.groups,
          action.modifiedGroupIds,
        ),
        originalPermissions: mergeGroupsPermissionsUpdates(
          state.originalPermissions,
          action.graph.groups,
          action.modifiedGroupIds,
        ),
        revision: action.graph.revision,
        hasRevisionChanged: false,
        drafts: EMPTY_DRAFTS,
        saveError: null,
      };
    case "saveFailed":
      return { ...state, saveError: action.error };
    case "saveErrorCleared":
      return { ...state, saveError: null };
    case "reset":
      return {
        ...state,
        permissions: state.originalPermissions,
        drafts: EMPTY_DRAFTS,
        saveError: null,
      };
  }
}

export const hasDraftChanges = (drafts: DataPermissionsDrafts) =>
  !_.isEmpty(drafts.sandboxes) || drafts.impersonations.length > 0;

export const getDraftGroupIds = (drafts: DataPermissionsDrafts) =>
  _.uniq([
    ...Object.values(drafts.sandboxes).map(({ group_id }) => String(group_id)),
    ...drafts.impersonations.map(({ group_id }) => String(group_id)),
  ]);

export const getIsDataPermissionsDirty = (state: DataPermissionsState) =>
  !_.isEqual(state.permissions, state.originalPermissions) ||
  hasDraftChanges(state.drafts);
