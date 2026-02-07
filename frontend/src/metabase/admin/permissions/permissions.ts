import { assocIn, getIn, merge } from "icepick";
import { push } from "react-router-redux";
import { t } from "ttag";
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
import { Groups } from "metabase/entities/groups";
import { Tables } from "metabase/entities/tables";
import {
  combineReducers,
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import {
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_DATA_PERMISSIONS,
} from "metabase/plugins";
import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";
import { CollectionsApi, PermissionsApi } from "metabase/services";

import { DataPermission, DataPermissionType } from "./types";
import { isDatabaseEntityId } from "./utils/data-entity-id";
import {
  getModifiedCollectionPermissionsGraphParts,
  getModifiedGroupsPermissionsGraphParts,
  mergeGroupsPermissionsUpdates,
} from "./utils/graph/partial-updates";

const INITIALIZE_DATA_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_DATA_PERMISSIONS";
export const initializeDataPermissions = createThunkAction(
  INITIALIZE_DATA_PERMISSIONS,
  () => async (dispatch) => {
    await Promise.all([
      dispatch(loadDataPermissions()),
      dispatch(Groups.actions.fetchList()),
    ]);
  },
);

export const LOAD_DATA_PERMISSIONS =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS";
export const loadDataPermissions = createThunkAction(
  LOAD_DATA_PERMISSIONS,
  () => async () => PermissionsApi.graph(),
);

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

export const LOAD_DATA_PERMISSIONS_FOR_GROUP =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS_FOR_GROUP";

export const LOAD_DATA_PERMISSIONS_FOR_DB =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS_FOR_GROUP";

const INITIALIZE_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_COLLECTION_PERMISSIONS";
export const initializeCollectionPermissions = createThunkAction(
  INITIALIZE_COLLECTION_PERMISSIONS,
  (namespace) => async (dispatch) => {
    await Promise.all([
      dispatch(loadCollectionPermissions(namespace)),
      dispatch(Groups.actions.fetchList()),
    ]);
  },
);

const LOAD_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_COLLECTION_PERMISSIONS";
export const loadCollectionPermissions = createThunkAction(
  LOAD_COLLECTION_PERMISSIONS,
  (namespace) => async () => {
    const params = namespace != null ? { namespace } : {};
    return CollectionsApi.graph(params);
  },
);

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
        }),
      );
    }

    dispatch(navigateToGranularPermissions(groupId, entityId));
  },
);

export const NAVIGATE_TO_GRANULAR_PERMISSIONS =
  "metabase/admin/permissions/NAVIGATE_TO_GRANULAR_PERMISSIONS";
export const navigateToGranularPermissions = createThunkAction(
  NAVIGATE_TO_GRANULAR_PERMISSIONS,
  (groupId, entityId) => (dispatch) => {
    dispatch(push(getGroupFocusPermissionsUrl(groupId, entityId)));
  },
);

export const UPDATE_DATA_PERMISSION =
  "metabase/admin/permissions/UPDATE_DATA_PERMISSION";
export const updateDataPermission = createThunkAction(
  UPDATE_DATA_PERMISSION,
  ({ groupId, permission: permissionInfo, value, entityId, view }) => {
    return (dispatch, getState) => {
      if (isDatabaseEntityId(entityId)) {
        dispatch(
          Tables.actions.fetchList({
            dbId: entityId.databaseId,
            include_hidden: true,
            remove_inactive: true,
            skip_fields: true,
          }),
        );
      }

      const metadata = getMetadataWithHiddenTables(getState(), null);
      if (permissionInfo.postActions) {
        const action = permissionInfo.postActions?.[value]?.(
          entityId,
          groupId,
          view,
          value,
          getState,
        );
        if (action) {
          dispatch(action);
          return;
        }
      }

      return { groupId, permissionInfo, value, metadata, entityId };
    };
  },
);

export const SAVE_DATA_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_DATA_PERMISSIONS";
export const saveDataPermissions = createThunkAction(
  SAVE_DATA_PERMISSIONS,
  () => async (_dispatch, getState) => {
    const state = getState();
    const allGroupIds = Object.keys(state.entities.groups);
    const {
      originalDataPermissions,
      dataPermissions,
      dataPermissionsRevision,
    } = state.admin.permissions;

    const advancedPermissions =
      PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.reduce(
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

    const response = await PermissionsApi.updateGraph({
      groups: modifiedGroups,
      revision: dataPermissionsRevision,
      ...advancedPermissions.permissions,
    });

    return {
      ...response,
      modifiedGroupIds,
    };
  },
);

const UPDATE_COLLECTION_PERMISSION =
  "metabase/admin/permissions/UPDATE_COLLECTION_PERMISSION";
export const updateCollectionPermission = createAction(
  UPDATE_COLLECTION_PERMISSION,
);

const SAVE_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_COLLECTION_PERMISSIONS";
export const saveCollectionPermissions = createThunkAction(
  SAVE_COLLECTION_PERMISSIONS,
  (namespace) => async (_dispatch, getState) => {
    const {
      originalCollectionPermissions,
      collectionPermissions,
      collectionPermissionsRevision,
    } = getState().admin.permissions;

    const modifiedPermissions = getModifiedCollectionPermissionsGraphParts(
      originalCollectionPermissions,
      collectionPermissions,
    );

    const result = await CollectionsApi.updateGraph({
      namespace,
      revision: collectionPermissionsRevision,
      groups: modifiedPermissions,
    });

    return {
      ...result,
      groups: collectionPermissions,
    };
  },
);

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
      dispatch(Groups.actions.fetchList()),
    ]);
  },
);

const LOAD_TENANT_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_TENANT_COLLECTION_PERMISSIONS";
export const loadTenantCollectionPermissions = createThunkAction(
  LOAD_TENANT_COLLECTION_PERMISSIONS,
  () => async () => {
    return CollectionsApi.graph({ namespace: TENANT_NAMESPACE });
  },
);

const UPDATE_TENANT_COLLECTION_PERMISSION =
  "metabase/admin/permissions/UPDATE_TENANT_COLLECTION_PERMISSION";
export const updateTenantCollectionPermission = createAction(
  UPDATE_TENANT_COLLECTION_PERMISSION,
);

const SAVE_TENANT_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_TENANT_COLLECTION_PERMISSIONS";
export const saveTenantCollectionPermissions = createThunkAction(
  SAVE_TENANT_COLLECTION_PERMISSIONS,
  () => async (_dispatch, getState) => {
    const {
      originalTenantCollectionPermissions,
      tenantCollectionPermissions,
      tenantCollectionPermissionsRevision,
    } = getState().admin.permissions;

    const modifiedPermissions = getModifiedCollectionPermissionsGraphParts(
      originalTenantCollectionPermissions,
      tenantCollectionPermissions,
    );

    const result = await CollectionsApi.updateGraph({
      namespace: TENANT_NAMESPACE,
      revision: tenantCollectionPermissionsRevision,
      groups: modifiedPermissions,
    });

    return {
      ...result,
      groups: tenantCollectionPermissions,
    };
  },
);

// Tenant-Specific Collection Permissions Actions
const INITIALIZE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS";
export const initializeTenantSpecificCollectionPermissions = createThunkAction(
  INITIALIZE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
  () => async (dispatch) => {
    await Promise.all([
      dispatch(loadTenantSpecificCollectionPermissions()),
      dispatch(Groups.actions.fetchList()),
    ]);
  },
);

const LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS";
export const loadTenantSpecificCollectionPermissions = createThunkAction(
  LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
  () => async () => {
    return CollectionsApi.graph({ namespace: TENANT_SPECIFIC_NAMESPACE });
  },
);

const UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION =
  "metabase/admin/permissions/UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION";
export const updateTenantSpecificCollectionPermission = createAction(
  UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION,
);

const SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS";
export const saveTenantSpecificCollectionPermissions = createThunkAction(
  SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS,
  () => async (_dispatch, getState) => {
    const {
      originalTenantSpecificCollectionPermissions,
      tenantSpecificCollectionPermissions,
      tenantSpecificCollectionPermissionsRevision,
    } = getState().admin.permissions;

    const modifiedPermissions = getModifiedCollectionPermissionsGraphParts(
      originalTenantSpecificCollectionPermissions,
      tenantSpecificCollectionPermissions,
    );

    const result = await CollectionsApi.updateGraph({
      namespace: TENANT_SPECIFIC_NAMESPACE,
      revision: tenantSpecificCollectionPermissionsRevision,
      groups: modifiedPermissions,
    });

    return {
      ...result,
      groups: tenantSpecificCollectionPermissions,
    };
  },
);

const CLEAR_SAVE_ERROR = "metabase/admin/permissions/CLEAR_SAVE_ERROR";
export const clearSaveError = createAction(CLEAR_SAVE_ERROR);

const savePermission = {
  next: (_state) => null,
  throw: (_state, { payload }) => {
    return (
      (payload && typeof payload.data === "string"
        ? payload.data
        : payload.data?.message) || t`Sorry, an error occurred.`
    );
  },
};

const saveError = handleActions(
  {
    [SAVE_DATA_PERMISSIONS]: savePermission,
    [LOAD_DATA_PERMISSIONS]: {
      next: () => null,
    },
    [SAVE_COLLECTION_PERMISSIONS]: savePermission,
    [LOAD_COLLECTION_PERMISSIONS]: {
      next: () => null,
    },
    [SAVE_TENANT_COLLECTION_PERMISSIONS]: savePermission,
    [LOAD_TENANT_COLLECTION_PERMISSIONS]: {
      next: () => null,
    },
    [SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: savePermission,
    [LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: () => null,
    },
    [CLEAR_SAVE_ERROR]: { next: () => null },
  },
  null,
);

function getDecendentCollections(collection) {
  const subCollections = collection.children.filter(
    (collection) => !collection.is_personal,
  );
  return subCollections.concat(...subCollections.map(getDecendentCollections));
}

const dataPermissions = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [LOAD_DATA_PERMISSIONS_FOR_GROUP]: {
      next: (state, { payload }) => merge(payload.groups, state),
    },
    [LOAD_DATA_PERMISSIONS_FOR_DB]: {
      next: (state, { payload }) => merge(payload.groups, state),
    },
    [SAVE_DATA_PERMISSIONS]: {
      next: (state, { payload }) =>
        mergeGroupsPermissionsUpdates(
          state,
          payload.groups,
          payload.modifiedGroupIds,
        ),
    },
    [UPDATE_DATA_PERMISSION]: {
      next: (state, { payload }) => {
        if (payload == null) {
          return state;
        }

        const { value, groupId, entityId, metadata, permissionInfo } = payload;

        const database = metadata.database(entityId.databaseId);

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

        if (entityId.tableId != null) {
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
        } else if (entityId.schemaName != null) {
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
      },
    },
  },
  null,
);

const originalDataPermissions = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [LOAD_DATA_PERMISSIONS_FOR_GROUP]: {
      next: (state, { payload }) => merge(payload.groups, state),
    },
    [LOAD_DATA_PERMISSIONS_FOR_DB]: {
      next: (state, { payload }) => merge(payload.groups, state),
    },
    [SAVE_DATA_PERMISSIONS]: {
      next: (state, { payload }) =>
        mergeGroupsPermissionsUpdates(
          state,
          payload.groups,
          payload.modifiedGroupIds,
        ),
    },
  },
  null,
);

const dataPermissionsRevision = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
    [LOAD_DATA_PERMISSIONS_FOR_GROUP]: {
      next: (state, { payload }) => payload.revision,
    },
    [LOAD_DATA_PERMISSIONS_FOR_DB]: {
      next: (state, { payload }) => payload.revision,
    },
    [SAVE_DATA_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
  },
  null,
);

const collectionPermissions = handleActions(
  {
    [LOAD_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [UPDATE_COLLECTION_PERMISSION]: {
      next: (state, { payload }) => {
        const {
          collection,
          groupId,
          originalPermissionsState,
          shouldPropagateToChildren,
          value,
        } = payload;
        let newPermissionsState = assocIn(
          state,
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
                : getIn(originalPermissionsState, [groupId, descendent.id]),
            );
          }
        }

        return newPermissionsState;
      },
    },
    [SAVE_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
  },
  null,
);

const originalCollectionPermissions = handleActions(
  {
    [LOAD_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_COLLECTION_PERMISSIONS]: {
      next: (state, { payload }) => payload.groups,
    },
  },
  null,
);

const collectionPermissionsRevision = handleActions(
  {
    [LOAD_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
    [SAVE_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
  },
  null,
);

// Tenant Collection Permissions Reducers
const tenantCollectionPermissions = handleActions(
  {
    [LOAD_TENANT_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [UPDATE_TENANT_COLLECTION_PERMISSION]: {
      next: (state, { payload }) => {
        const { groupId, collection, value, shouldPropagateToChildren } =
          payload;
        let newPermissions = assocIn(state, [groupId, collection.id], value);

        if (shouldPropagateToChildren) {
          for (const descendent of getDecendentCollections(collection)) {
            newPermissions = assocIn(
              newPermissions,
              [groupId, descendent.id],
              value,
            );
          }
        }
        return newPermissions;
      },
    },
    [SAVE_TENANT_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
  },
  null,
);

const originalTenantCollectionPermissions = handleActions(
  {
    [LOAD_TENANT_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_TENANT_COLLECTION_PERMISSIONS]: {
      next: (state, { payload }) => payload.groups,
    },
  },
  null,
);

const tenantCollectionPermissionsRevision = handleActions(
  {
    [LOAD_TENANT_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
    [SAVE_TENANT_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
  },
  null,
);

// Tenant-Specific Collection Permissions Reducers
const tenantSpecificCollectionPermissions = handleActions(
  {
    [LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [UPDATE_TENANT_SPECIFIC_COLLECTION_PERMISSION]: {
      next: (state, { payload }) => {
        const { groupId, collection, value, shouldPropagateToChildren } =
          payload;
        let newPermissions = assocIn(state, [groupId, collection.id], value);

        if (shouldPropagateToChildren) {
          for (const descendent of getDecendentCollections(collection)) {
            newPermissions = assocIn(
              newPermissions,
              [groupId, descendent.id],
              value,
            );
          }
        }
        return newPermissions;
      },
    },
    [SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
  },
  null,
);

const originalTenantSpecificCollectionPermissions = handleActions(
  {
    [LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: (state, { payload }) => payload.groups,
    },
  },
  null,
);

const tenantSpecificCollectionPermissionsRevision = handleActions(
  {
    [LOAD_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
    [SAVE_TENANT_SPECIFIC_COLLECTION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
  },
  null,
);

export const TOGGLE_HELP_REFERENCE =
  "metabase/admin/permissions/TOGGLE_HELP_REFERENCE";
export const toggleHelpReference = createAction(TOGGLE_HELP_REFERENCE);

export const isHelpReferenceOpen = handleActions(
  {
    [toggleHelpReference]: {
      next: (state) => !state,
    },
  },
  false,
);

const checkRevisionChanged = (state, { payload }) => {
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

const hasRevisionChanged = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: checkRevisionChanged,
    },
    [LOAD_DATA_PERMISSIONS_FOR_GROUP]: {
      next: checkRevisionChanged,
    },
    [LOAD_DATA_PERMISSIONS_FOR_DB]: {
      next: checkRevisionChanged,
    },
    [SAVE_DATA_PERMISSIONS]: {
      next: (state, { payload }) => ({
        revision: payload.revision,
        hasChanged: false,
      }),
    },
  },
  {
    revision: null,
    hasChanged: false,
  },
);

export const permissions = combineReducers({
  saveError,
  dataPermissions,
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
