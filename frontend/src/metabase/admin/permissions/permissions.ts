import {
  type PayloadAction,
  type UnknownAction,
  createReducer,
  current, // immer and icepick don't play nicely together
} from "@reduxjs/toolkit";
import { assocIn, merge } from "icepick";
import { isBoolean } from "underscore";

import {
  inferAndUpdateEntityPermissions,
  restrictCreateQueriesPermissionsIfNeeded,
  revokeTransformsPermissionIfNeeded,
  updateFieldsPermission,
  updatePermission,
  updateSchemasPermission,
  updateTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import { collectionApi, databaseApi, permissionApi } from "metabase/api";
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
import type {
  Collection,
  CollectionPermissions,
  CollectionPermissionsGraph,
  DatabaseId,
  GroupId,
  GroupsPermissions,
  PermissionEntityId,
  PermissionsDatabase,
  PermissionsGraph,
} from "metabase-types/api";

import {
  DATABASE_TABLES_QUERY,
  getPermissionsDatabase,
} from "./selectors/data-permissions/databases";
import { selectGroupList } from "./selectors/data-permissions/groups";
import {
  DataPermission,
  DataPermissionType,
  type DataPermissionValue,
  type PermissionSectionConfig,
} from "./types";
import { isSchemaEntityId, isTableEntityId } from "./utils/data-entity-id";
import {
  getModifiedCollectionPermissionsGraphParts,
  getModifiedGroupsPermissionsGraphParts,
  mergeGroupsPermissionsUpdates,
} from "./utils/graph/partial-updates";

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

const INITIALIZE_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_COLLECTION_PERMISSIONS";
export const initializeCollectionPermissions = createThunkAction(
  INITIALIZE_COLLECTION_PERMISSIONS,
  (namespace) => async (dispatch) => {
    await Promise.all([
      dispatch(loadCollectionPermissions(namespace)),
      dispatch(permissionApi.endpoints.listPermissionsGroups.initiate({})),
    ]);
  },
);

const LOAD_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_COLLECTION_PERMISSIONS";
export const loadCollectionPermissions = createThunkAction(
  LOAD_COLLECTION_PERMISSIONS,
  (namespace) => async (dispatch) => {
    const params = namespace != null ? { namespace } : {};
    return runRtkEndpoint(
      params,
      dispatch,
      collectionApi.endpoints.getCollectionPermissionsGraph,
    );
  },
);
function isLoadCollectionPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<CollectionPermissionsGraph> {
  return !isErrorAction(action) && action.type === LOAD_COLLECTION_PERMISSIONS;
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

export type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagateToChildren: boolean | null;
  originalPermissionsState?: CollectionPermissions;
};
const UPDATE_COLLECTION_PERMISSION =
  "metabase/admin/permissions/UPDATE_COLLECTION_PERMISSION";
export const updateCollectionPermission =
  createAction<UpdateCollectionPermissionParams>(UPDATE_COLLECTION_PERMISSION);
function isUpdateCollectionPermissionAction(
  action: UnknownAction,
): action is PayloadAction<UpdateCollectionPermissionParams> {
  return !isErrorAction(action) && action.type === UPDATE_COLLECTION_PERMISSION;
}

const SAVE_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_COLLECTION_PERMISSIONS";
export const saveCollectionPermissions = createThunkAction(
  SAVE_COLLECTION_PERMISSIONS,
  (namespace) => async (dispatch, getState) => {
    const {
      originalCollectionPermissions,
      collectionPermissions,
      collectionPermissionsRevision,
    } = getState().admin.permissions;

    const modifiedPermissions = getModifiedCollectionPermissionsGraphParts(
      originalCollectionPermissions,
      collectionPermissions,
    );

    const result = await runRtkEndpoint(
      {
        namespace,
        revision: collectionPermissionsRevision,
        groups: modifiedPermissions,
      },
      dispatch,
      collectionApi.endpoints.updateCollectionPermissionsGraph,
    );

    return {
      ...result,
      groups: collectionPermissions,
    };
  },
);
function isSaveCollectionPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<CollectionPermissionsGraph> {
  return !isErrorAction(action) && action.type === SAVE_COLLECTION_PERMISSIONS;
}

// Shared Tenant Collection Permissions
const TENANT_NAMESPACE = "shared-tenant-collection";

// Tenant-Specific Collection Permissions
const TENANT_SPECIFIC_NAMESPACE = "tenant-specific";

const INITIALIZE_TENANT_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_TENANT_COLLECTION_PERMISSIONS";
export const initializeTenantCollectionPermissions = createThunkAction(
  INITIALIZE_TENANT_COLLECTION_PERMISSIONS,
  () => async (dispatch) => {
    await Promise.all([
      dispatch(loadTenantCollectionPermissions()),
      dispatch(permissionApi.endpoints.listPermissionsGroups.initiate({})),
    ]);
  },
);

const LOAD_TENANT_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_TENANT_COLLECTION_PERMISSIONS";
export const loadTenantCollectionPermissions = createThunkAction(
  LOAD_TENANT_COLLECTION_PERMISSIONS,
  () => async (dispatch) => {
    return runRtkEndpoint(
      { namespace: TENANT_NAMESPACE },
      dispatch,
      collectionApi.endpoints.getCollectionPermissionsGraph,
    );
  },
);
function isLoadTenantCollectionPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<CollectionPermissionsGraph> {
  return (
    !isErrorAction(action) && action.type === LOAD_TENANT_COLLECTION_PERMISSIONS
  );
}

export type UpdateTenantCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagateToChildren: boolean;
};
const UPDATE_TENANT_COLLECTION_PERMISSION =
  "metabase/admin/permissions/UPDATE_TENANT_COLLECTION_PERMISSION";
export const updateTenantCollectionPermission =
  createAction<UpdateTenantCollectionPermissionParams>(
    UPDATE_TENANT_COLLECTION_PERMISSION,
  );
function isUpdateTenantCollectionPermissionAction(
  action: UnknownAction,
): action is PayloadAction<UpdateTenantCollectionPermissionParams> {
  return (
    !isErrorAction(action) &&
    action.type === UPDATE_TENANT_COLLECTION_PERMISSION
  );
}

const SAVE_TENANT_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_TENANT_COLLECTION_PERMISSIONS";
export const saveTenantCollectionPermissions = createThunkAction(
  SAVE_TENANT_COLLECTION_PERMISSIONS,
  () => async (dispatch, getState) => {
    const {
      originalTenantCollectionPermissions,
      tenantCollectionPermissions,
      tenantCollectionPermissionsRevision,
    } = getState().admin.permissions;

    const modifiedPermissions = getModifiedCollectionPermissionsGraphParts(
      originalTenantCollectionPermissions,
      tenantCollectionPermissions,
    );

    const result = await runRtkEndpoint(
      {
        namespace: TENANT_NAMESPACE,
        revision: tenantCollectionPermissionsRevision,
        groups: modifiedPermissions,
      },
      dispatch,
      collectionApi.endpoints.updateCollectionPermissionsGraph,
    );

    return {
      ...result,
      groups: tenantCollectionPermissions,
    };
  },
);
function isSaveTenantCollectionPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<CollectionPermissionsGraph> {
  return (
    !isErrorAction(action) && action.type === SAVE_TENANT_COLLECTION_PERMISSIONS
  );
}

// Tenant-Specific Collection Permissions Actions
const INITIALIZE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS";
export const initializeTenantSpecificCollectionPermissions = createThunkAction(
  INITIALIZE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
  () => async (dispatch) => {
    await Promise.all([
      dispatch(loadTenantSpecificCollectionPermissions()),
      dispatch(permissionApi.endpoints.listPermissionsGroups.initiate({})),
    ]);
  },
);

const LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS";
export const loadTenantSpecificCollectionPermissions = createThunkAction(
  LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
  () => async (dispatch) => {
    return runRtkEndpoint(
      { namespace: TENANT_SPECIFIC_NAMESPACE },
      dispatch,
      collectionApi.endpoints.getCollectionPermissionsGraph,
    );
  },
);
function isLoadTenantSpecificCollectionPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<CollectionPermissionsGraph> {
  return (
    !isErrorAction(action) &&
    action.type === LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS
  );
}

const UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION =
  "metabase/admin/permissions/UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION";
export const updateTenantSpecificCollectionPermission =
  createAction<UpdateTenantCollectionPermissionParams>(
    UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION,
  );
function isUpdateTenantSpecificCollectionPermissionAction(
  action: UnknownAction,
): action is PayloadAction<UpdateTenantCollectionPermissionParams> {
  return (
    !isErrorAction(action) &&
    action.type === UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION
  );
}

const SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS";
export const saveTenantSpecificCollectionPermissions = createThunkAction(
  SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
  () => async (dispatch, getState) => {
    const {
      originalTenantSpecificCollectionPermissions,
      tenantSpecificCollectionPermissions,
      tenantSpecificCollectionPermissionsRevision,
    } = getState().admin.permissions;

    const modifiedPermissions = getModifiedCollectionPermissionsGraphParts(
      originalTenantSpecificCollectionPermissions,
      tenantSpecificCollectionPermissions,
    );

    const result = await runRtkEndpoint(
      {
        namespace: TENANT_SPECIFIC_NAMESPACE,
        revision: tenantSpecificCollectionPermissionsRevision,
        groups: modifiedPermissions,
      },
      dispatch,
      collectionApi.endpoints.updateCollectionPermissionsGraph,
    );

    return {
      ...result,
      groups: tenantSpecificCollectionPermissions,
    };
  },
);
function isSaveTenantSpecificCollectionPermissionsAction(
  action: UnknownAction,
): action is PayloadAction<CollectionPermissionsGraph> {
  return (
    !isErrorAction(action) &&
    action.type === SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS
  );
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
  return (
    isErrorAction(action) &&
    [
      SAVE_DATA_PERMISSIONS,
      SAVE_COLLECTION_PERMISSIONS,
      SAVE_TENANT_COLLECTION_PERMISSIONS,
      SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
    ].includes(action.type)
  );
}

const saveError = createReducer<string | null>(null, (builder) => {
  builder.addMatcher(isSaveDataPermissionsAction, () => null);
  builder.addMatcher(isLoadDataPermissionsAction, () => null);
  builder.addMatcher(isSaveCollectionPermissionsAction, () => null);
  builder.addMatcher(isLoadCollectionPermissionsAction, () => null);
  builder.addMatcher(isSaveTenantCollectionPermissionsAction, () => null);
  builder.addMatcher(isLoadTenantCollectionPermissionsAction, () => null);
  builder.addMatcher(
    isSaveTenantSpecificCollectionPermissionsAction,
    () => null,
  );
  builder.addMatcher(
    isLoadTenantSpecificCollectionPermissionsAction,
    () => null,
  );
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

function getDecendentCollections(collection: Collection): Collection[] {
  if (!collection.children) {
    return [];
  }
  const subCollections = collection.children.filter(
    (collection) => !collection.is_personal,
  );
  return subCollections.concat(...subCollections.map(getDecendentCollections));
}

const collectionPermissions = createReducer<CollectionPermissions | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isUpdateCollectionPermissionAction,
      (state, { payload }) => {
        const {
          collection,
          groupId,
          originalPermissionsState,
          shouldPropagateToChildren,
          value,
        } = payload;
        let newPermissionsState = assocIn(
          state != null ? current(state) : state,
          [groupId, collection.id],
          value,
        );

        /**
         * Check if shouldPropagateToChildren is explicitly set (true or false) vs unset (null or undefined).
         * If it's a boolean, we either propagate the new value or restore the original. When not a boolean, we do nothing.
         */
        if (isBoolean(shouldPropagateToChildren)) {
          for (const descendent of getDecendentCollections(collection)) {
            newPermissionsState = assocIn(
              newPermissionsState,
              [groupId, descendent.id],
              shouldPropagateToChildren
                ? value
                : originalPermissionsState?.[groupId]?.[descendent.id],
            );
          }
        }

        return newPermissionsState;
      },
    );
    builder.addMatcher(
      isSaveCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
  },
);

const originalCollectionPermissions =
  createReducer<CollectionPermissions | null>(null, (builder) => {
    builder.addMatcher(
      isLoadCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isSaveCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
  });

const collectionPermissionsRevision = createReducer<number | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadCollectionPermissionsAction,
      (state, { payload }) => payload.revision,
    );
    builder.addMatcher(
      isSaveCollectionPermissionsAction,
      (state, { payload }) => payload.revision,
    );
  },
);

function handleUpdateTenantCollectionPermission(
  state: CollectionPermissions | null,
  { payload }: PayloadAction<UpdateTenantCollectionPermissionParams>,
) {
  const { groupId, collection, value, shouldPropagateToChildren } = payload;
  let newPermissions = assocIn(
    state != null ? current(state) : state,
    [groupId, collection.id],
    value,
  );

  if (shouldPropagateToChildren) {
    for (const descendent of getDecendentCollections(collection)) {
      newPermissions = assocIn(newPermissions, [groupId, descendent.id], value);
    }
  }
  return newPermissions;
}

const tenantCollectionPermissions = createReducer<CollectionPermissions | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadTenantCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isUpdateTenantCollectionPermissionAction,
      handleUpdateTenantCollectionPermission,
    );
    builder.addMatcher(
      isSaveTenantCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
  },
);

const originalTenantCollectionPermissions =
  createReducer<CollectionPermissions | null>(null, (builder) => {
    builder.addMatcher(
      isLoadTenantCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isSaveTenantCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
  });

const tenantCollectionPermissionsRevision = createReducer<number | null>(
  null,
  (builder) => {
    builder.addMatcher(
      isLoadTenantCollectionPermissionsAction,
      (state, { payload }) => payload.revision,
    );
    builder.addMatcher(
      isSaveTenantCollectionPermissionsAction,
      (state, { payload }) => payload.revision,
    );
  },
);

const tenantSpecificCollectionPermissions =
  createReducer<CollectionPermissions | null>(null, (builder) => {
    builder.addMatcher(
      isLoadTenantSpecificCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isUpdateTenantSpecificCollectionPermissionAction,
      handleUpdateTenantCollectionPermission, // same handler for tenant and tenant-specific
    );
    builder.addMatcher(
      isSaveTenantSpecificCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
  });

const originalTenantSpecificCollectionPermissions =
  createReducer<CollectionPermissions | null>(null, (builder) => {
    builder.addMatcher(
      isLoadTenantSpecificCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
    builder.addMatcher(
      isSaveTenantSpecificCollectionPermissionsAction,
      (state, { payload }) => payload.groups,
    );
  });

const tenantSpecificCollectionPermissionsRevision = createReducer<
  number | null
>(null, (builder) => {
  builder.addMatcher(
    isLoadTenantSpecificCollectionPermissionsAction,
    (state, { payload }) => payload.revision,
  );
  builder.addMatcher(
    isSaveTenantSpecificCollectionPermissionsAction,
    (state, { payload }) => payload.revision,
  );
});

export const TOGGLE_HELP_REFERENCE =
  "metabase/admin/permissions/TOGGLE_HELP_REFERENCE";
export const toggleHelpReference = createAction(TOGGLE_HELP_REFERENCE);
function isToggleHelpReferenceAction(
  action: UnknownAction,
): action is PayloadAction<void> {
  return !isErrorAction(action) && action.type === TOGGLE_HELP_REFERENCE;
}

export const isHelpReferenceOpen = createReducer<boolean>(false, (builder) => {
  builder.addMatcher(isToggleHelpReferenceAction, (state) => !state);
});

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
  collectionPermissions,
  originalCollectionPermissions,
  collectionPermissionsRevision,
  tenantCollectionPermissions,
  originalTenantCollectionPermissions,
  tenantCollectionPermissionsRevision,
  tenantSpecificCollectionPermissions,
  originalTenantSpecificCollectionPermissions,
  tenantSpecificCollectionPermissionsRevision,
  isHelpReferenceOpen,
  hasRevisionChanged,
});
