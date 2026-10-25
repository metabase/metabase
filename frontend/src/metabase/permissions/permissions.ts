import {
  type PayloadAction,
  type UnknownAction,
  createReducer,
  current, // immer and icepick don't play nicely together
} from "@reduxjs/toolkit";
import { merge } from "icepick";

import { databaseApi, permissionApi } from "metabase/api";
import { type ErrorPayload, getErrorMessage } from "metabase/api/utils/errors";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_DATA_PERMISSIONS,
} from "metabase/plugins";
import {
  combineReducers,
  createAction,
  createThunkAction,
} from "metabase/redux";
import { navigate } from "metabase/router";
import {
  DataPermission,
  DataPermissionType,
  type DataPermissionValue,
  type DatabaseId,
  type GroupId,
  type GroupsPermissions,
  type PermissionEntityId,
  type PermissionsDatabase,
  type PermissionsGraph,
} from "metabase-types/api";

import {
  DATABASE_TABLES_QUERY,
  getPermissionsDatabase,
} from "./selectors/data-permissions/databases";
import { selectGroupList } from "./selectors/data-permissions/groups";
import type { PermissionSectionConfig } from "./types";
import { isSchemaEntityId, isTableEntityId } from "./utils/data-entity-id";
import {
  inferAndUpdateEntityPermissions,
  restrictCreateQueriesPermissionsIfNeeded,
  revokeTransformsPermissionIfNeeded,
  updateFieldsPermission,
  updatePermission,
  updateSchemasPermission,
  updateTablesPermission,
} from "./utils/graph";
import {
  getModifiedGroupsPermissionsGraphParts,
  mergeGroupsPermissionsUpdates,
} from "./utils/graph/partial-updates";
import { getGroupFocusPermissionsUrl } from "./utils/urls";

function isErrorAction(action: UnknownAction) {
  return action.error === true;
}

export const LOAD_DATA_PERMISSIONS =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS";
export const loadDataPermissions = createThunkAction(
  LOAD_DATA_PERMISSIONS,
  () => async (dispatch) =>
    runRtkEndpoint(
      undefined,
      dispatch,
      permissionApi.endpoints.getPermissionsGraph,
    ),
);
function isLoadDataPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<PermissionsGraph> {
  return !isErrorAction(action) && action.type === LOAD_DATA_PERMISSIONS;
}

export const RESTORE_LOADED_PERMISSIONS =
  "metabase/admin/permissions/RESTORE_LOADED_PERMISSIONS";

export const restoreLoadedPermissions = createThunkAction(
  RESTORE_LOADED_PERMISSIONS,
  () => async (dispatch, getState) => {
    const state = getState();
    const groups = state.admin.permissions.originalDataPermissions;
    const revision = state.admin.permissions.dataPermissionsRevision;
    dispatch({ type: LOAD_DATA_PERMISSIONS, payload: { groups, revision } });
  },
);

const LOAD_DATA_PERMISSIONS_FOR_GROUP =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS_FOR_GROUP";
export const loadDataPermissionsForGroup = createThunkAction(
  LOAD_DATA_PERMISSIONS_FOR_GROUP,
  (groupId: number | undefined) => async (dispatch) =>
    runRtkEndpoint(
      groupId,
      dispatch,
      permissionApi.endpoints.getGroupPermissionsGraph,
    ),
);
function isLoadDataPermissionsForGroupAction(
  action: UnknownAction,
): action is PayloadAction<PermissionsGraph> {
  return (
    !isErrorAction(action) && action.type === LOAD_DATA_PERMISSIONS_FOR_GROUP
  );
}

const LOAD_DATA_PERMISSIONS_FOR_DB =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS_FOR_DB";
export const loadDataPermissionsForDb = createThunkAction(
  LOAD_DATA_PERMISSIONS_FOR_DB,
  (databaseId: number | undefined) => async (dispatch) =>
    runRtkEndpoint(
      databaseId,
      dispatch,
      permissionApi.endpoints.getDatabasePermissionsGraph,
    ),
);
function isLoadDataPermissionsForDbAction(
  action: UnknownAction,
): action is PayloadAction<PermissionsGraph> {
  return !isErrorAction(action) && action.type === LOAD_DATA_PERMISSIONS_FOR_DB;
}

export const LIMIT_DATABASE_PERMISSION =
  "metabase/admin/permissions/LIMIT_DATABASE_PERMISSION";
export const limitDatabasePermission = createThunkAction(
  LIMIT_DATABASE_PERMISSION,
  (groupId, entityId, accessPermissionValue) => (dispatch) => {
    const newValue =
      PLUGIN_ADVANCED_PERMISSIONS.getDatabaseLimitedAccessPermission(
        accessPermissionValue,
      );

    if (newValue) {
      dispatch(
        updateDataPermission({
          groupId,
          permission: {
            type: DataPermissionType.ACCESS,
            permission: DataPermission.VIEW_DATA,
          },
          value: newValue,
          entityId,
          view: "group",
        }),
      );
    }

    navigateToGranularPermissions(groupId, entityId);
  },
);

export const navigateToGranularPermissions = (
  groupId: GroupId,
  entityId: PermissionEntityId,
) => navigate(getGroupFocusPermissionsUrl(groupId, entityId));

export interface UpdateDataPermissionParams {
  groupId: GroupId;
  permission: Pick<
    PermissionSectionConfig,
    "type" | "permission" | "postActions"
  >;
  value: DataPermissionValue;
  entityId: PermissionEntityId;
  view: "database" | "group";
}
export interface UpdateDataPermissionPayload {
  groupId: GroupId;
  permissionInfo: Pick<
    PermissionSectionConfig,
    "type" | "permission" | "postActions"
  >;
  value: DataPermissionValue;
  database: PermissionsDatabase | undefined;
  entityId: PermissionEntityId;
}
export const UPDATE_DATA_PERMISSION =
  "metabase/admin/permissions/UPDATE_DATA_PERMISSION";
export const updateDataPermission = createThunkAction(
  UPDATE_DATA_PERMISSION,
  ({
    groupId,
    permission: permissionInfo,
    value,
    entityId,
    view,
  }: UpdateDataPermissionParams) => {
    return async (
      dispatch,
      getState,
    ): Promise<UpdateDataPermissionPayload | undefined> => {
      // The reducer writes one entry per schema, so it needs the database's
      // tables. Drilling into a database loads them, but the database list can
      // be edited without ever opening one, so fetch when they are missing.
      // Swallow rejections; the reducer treats a missing database as a no-op.
      const database =
        getPermissionsDatabase(getState(), entityId.databaseId) ??
        (await runRtkEndpoint(
          { id: entityId.databaseId, ...DATABASE_TABLES_QUERY },
          dispatch,
          databaseApi.endpoints.getDatabaseMetadata,
          { forceRefetch: false },
        ).catch(() => undefined));
      const postAction = permissionInfo.postActions?.[value];
      if (postAction) {
        // A post action takes the change over: it sends the admin to where this
        // value is configured, so the permission is not applied here.
        const action = postAction(entityId, groupId, view, value, getState);
        if (action) {
          dispatch(action);
        }
        return;
      }

      return { groupId, permissionInfo, value, database, entityId };
    };
  },
);
function isUpdateDataPermissionAction(
  action: UnknownAction,
): action is PayloadAction<UpdateDataPermissionPayload | undefined> {
  return !isErrorAction(action) && action.type === UPDATE_DATA_PERMISSION;
}

export const SAVE_DATA_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_DATA_PERMISSIONS";
export const saveDataPermissions = createThunkAction(
  SAVE_DATA_PERMISSIONS,
  () => async (dispatch, getState) => {
    const state = getState();
    const allGroupIds = selectGroupList(state).map((group) => String(group.id));
    const {
      originalDataPermissions,
      dataPermissions,
      dataPermissionsRevision,
    } = state.admin.permissions;

    const advancedPermissions =
      PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.reduce<{
        modifiedGroupIds: string[];
        permissions: Record<string, undefined | { group_id: number }[]>;
      }>(
        (data, selector) => {
          const [extraData, modifiedGroupIds] = selector(state);
          return {
            permissions: { ...data.permissions, ...extraData },
            modifiedGroupIds: [...data.modifiedGroupIds, ...modifiedGroupIds],
          };
        },
        { modifiedGroupIds: [], permissions: {} },
      );

    const modifiedGroups = getModifiedGroupsPermissionsGraphParts(
      dataPermissions,
      originalDataPermissions,
      allGroupIds,
      advancedPermissions.modifiedGroupIds,
    );
    const modifiedGroupIds = Object.keys(modifiedGroups);

    const response = await runRtkEndpoint(
      {
        groups: modifiedGroups,
        revision: dataPermissionsRevision,
        ...advancedPermissions.permissions,
      },
      dispatch,
      permissionApi.endpoints.updatePermissionsGraph,
    );

    return {
      ...response,
      modifiedGroupIds,
    };
  },
);
function isSaveDataPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<PermissionsGraph & { modifiedGroupIds: string[] }> {
  return !isErrorAction(action) && action.type === SAVE_DATA_PERMISSIONS;
}

const CLEAR_SAVE_ERROR = "metabase/admin/permissions/CLEAR_SAVE_ERROR";
export const clearSaveError = createAction(CLEAR_SAVE_ERROR);
function isClearSaveErrorAction(
  action: UnknownAction,
): action is PayloadAction<void> {
  return !isErrorAction(action) && action.type === CLEAR_SAVE_ERROR;
}

function isSaveErrorAction(
  action: UnknownAction,
): action is PayloadAction<ErrorPayload> {
  return isErrorAction(action) && action.type === SAVE_DATA_PERMISSIONS;
}

const saveError = createReducer<string | null>(null, (builder) => {
  builder.addMatcher(isSaveDataPermissionsAction, () => null);
  builder.addMatcher(isLoadDataPermissionsAction, () => null);
  builder.addMatcher(isClearSaveErrorAction, () => null);
  builder.addMatcher(isSaveErrorAction, (state, { payload }) => {
    return getErrorMessage(payload);
  });
});

const dataPermissions = createReducer<GroupsPermissions | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadDataPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isLoadDataPermissionsForGroupAction,
      (state, { payload }) =>
        state != null ? merge(payload.groups, current(state)) : payload.groups,
    );
    builder.addMatcher(isLoadDataPermissionsForDbAction, (state, { payload }) =>
      state != null ? merge(payload.groups, current(state)) : payload.groups,
    );
    builder.addMatcher(isSaveDataPermissionsAction, (state, { payload }) =>
      mergeGroupsPermissionsUpdates(
        state,
        payload.groups,
        payload.modifiedGroupIds,
      ),
    );
    builder.addMatcher(isUpdateDataPermissionAction, (state, { payload }) => {
      if (payload == null || state == null) {
        return state;
      }

      state = current(state); // some of the update functions use icepick which is incompatible with immer

      const { value, groupId, entityId, database, permissionInfo } = payload;

      if (database == null) {
        return state;
      }

      if (permissionInfo.type === DataPermissionType.DETAILS) {
        return updatePermission(
          state,
          groupId,
          entityId.databaseId,
          DataPermission.DETAILS,
          [],
          value,
        );
      }

      if (permissionInfo.type === DataPermissionType.TRANSFORMS) {
        return updatePermission(
          state,
          groupId,
          entityId.databaseId,
          DataPermission.TRANSFORMS,
          [],
          value,
        );
      }

      if (
        permissionInfo.type === DataPermissionType.NATIVE &&
        PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded
      ) {
        state = PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded(
          state,
          groupId,
          entityId,
          value,
          database,
          permissionInfo.permission,
        );
      }

      state = restrictCreateQueriesPermissionsIfNeeded(
        state,
        groupId,
        entityId,
        permissionInfo.permission,
        value,
        database,
      );

      state = revokeTransformsPermissionIfNeeded(
        state,
        groupId,
        entityId,
        permissionInfo.permission,
        value,
      );

      if (isTableEntityId(entityId)) {
        const updatedPermissions = updateFieldsPermission(
          state,
          groupId,
          entityId,
          value,
          database,
          permissionInfo.permission,
        );
        return inferAndUpdateEntityPermissions(
          updatedPermissions,
          groupId,
          entityId,
          database,
          permissionInfo.permission,
        );
      } else if (isSchemaEntityId(entityId)) {
        return updateTablesPermission(
          state,
          groupId,
          entityId,
          value,
          database,
          permissionInfo.permission,
        );
      } else {
        return updateSchemasPermission(
          state,
          groupId,
          entityId,
          value,
          database,
          permissionInfo.permission,
        );
      }
    });
  },
);

const originalDataPermissions = createReducer<GroupsPermissions | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadDataPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isLoadDataPermissionsForGroupAction,
      (state, { payload }) =>
        state != null ? merge(payload.groups, current(state)) : payload.groups,
    );
    builder.addMatcher(isLoadDataPermissionsForDbAction, (state, { payload }) =>
      state != null ? merge(payload.groups, current(state)) : payload.groups,
    );
    builder.addMatcher(isSaveDataPermissionsAction, (state, { payload }) =>
      mergeGroupsPermissionsUpdates(
        state,
        payload.groups,
        payload.modifiedGroupIds,
      ),
    );
  },
);

/**
 * Databases whose tables the tree has seen, kept for as long as the page is
 * open. The tables come from `getDatabaseMetadata`, whose cache entry is
 * unsubscribed as soon as the admin navigates away from that database, but the
 * save confirmation still has to name the tables an edit granted or revoked,
 * and a parent's confirmation still has to look at its children.
 */
type DatabasesWithTables = Record<DatabaseId, PermissionsDatabase>;

function databasesWithTables(
  state: DatabasesWithTables = {},
  action: UnknownAction,
): DatabasesWithTables {
  if (databaseApi.endpoints.getDatabaseMetadata.matchFulfilled(action)) {
    const database = action.payload;
    return { ...state, [database.id]: database };
  }
  if (isUpdateDataPermissionAction(action)) {
    const database = action.payload?.database;
    return database == null ? state : { ...state, [database.id]: database };
  }
  // Loading the graph covers both a fresh load and the reset after a save or a
  // discard, so the edits it clears are gone from the diff too.
  if (isLoadDataPermissionsAction(action)) {
    return {};
  }
  return state;
}

const dataPermissionsRevision = createReducer<number | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadDataPermissionsAction,
      (state, { payload }) => payload.revision,
    );
    builder.addMatcher(
      isLoadDataPermissionsForGroupAction,
      (state, { payload }) => payload.revision,
    );
    builder.addMatcher(
      isLoadDataPermissionsForDbAction,
      (state, { payload }) => payload.revision,
    );
    builder.addMatcher(
      isSaveDataPermissionsAction,
      (state, { payload }) => payload.revision,
    );
  },
);

interface RevisionChangedState {
  revision: number | null;
  hasChanged: boolean;
}

const checkRevisionChanged = (
  state: RevisionChangedState,
  { payload }: PayloadAction<{ revision: number }>,
) => {
  if (!state.revision) {
    return {
      revision: payload.revision,
      hasChanged: false,
    };
  } else if (state.revision === payload.revision && !state.hasChanged) {
    return state;
  } else {
    return {
      revision: payload.revision,
      hasChanged: true,
    };
  }
};
const hasRevisionChanged = createReducer<RevisionChangedState>(
  {
    revision: null,
    hasChanged: false,
  },
  (builder) => {
    builder.addMatcher(isLoadDataPermissionsAction, checkRevisionChanged);
    builder.addMatcher(
      isLoadDataPermissionsForGroupAction,
      checkRevisionChanged,
    );
    builder.addMatcher(isLoadDataPermissionsForDbAction, checkRevisionChanged);
    builder.addMatcher(isSaveDataPermissionsAction, (state, { payload }) => ({
      revision: payload.revision,
      hasChanged: false,
    }));
  },
);

export const permissions = combineReducers({
  saveError,
  dataPermissions,
  databasesWithTables,
  originalDataPermissions,
  dataPermissionsRevision,
  hasRevisionChanged,
});
