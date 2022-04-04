import { t } from "ttag";
import { push } from "react-router-redux";
import { assocIn } from "icepick";

import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";
import { CollectionsApi, PermissionsApi } from "metabase/services";
import Group from "metabase/entities/groups";
import Tables from "metabase/entities/tables";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  inferAndUpdateEntityPermissions,
  updateFieldsPermission,
  updateNativePermission,
  updateSchemasPermission,
  updateTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";
import { isDatabaseEntityId } from "./utils/data-entity-id";
import { trackPermissionChange } from "./analytics";

const INITIALIZE_DATA_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_DATA_PERMISSIONS";
export const initializeDataPermissions = createThunkAction(
  INITIALIZE_DATA_PERMISSIONS,
  () => async dispatch => {
    await Promise.all([
      dispatch(loadDataPermissions()),
      dispatch(Group.actions.fetchList()),
    ]);
  },
);

const LOAD_DATA_PERMISSIONS =
  "metabase/admin/permissions/LOAD_DATA_PERMISSIONS";
export const loadDataPermissions = createThunkAction(
  LOAD_DATA_PERMISSIONS,
  () => async () => PermissionsApi.graph(),
);

const INITIALIZE_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/INITIALIZE_COLLECTION_PERMISSIONS";
export const initializeCollectionPermissions = createThunkAction(
  INITIALIZE_COLLECTION_PERMISSIONS,
  namespace => async dispatch => {
    await Promise.all([
      dispatch(loadCollectionPermissions(namespace)),
      dispatch(Group.actions.fetchList()),
    ]);
  },
);

const LOAD_COLLECTION_PERMISSIONS =
  "metabase/admin/permissions/LOAD_COLLECTION_PERMISSIONS";
export const loadCollectionPermissions = createThunkAction(
  LOAD_COLLECTION_PERMISSIONS,
  namespace => async () => {
    const params = namespace != null ? { namespace } : {};
    return CollectionsApi.graph(params);
  },
);

export const LIMIT_DATABASE_PERMISSION =
  "metabase/admin/permissions/LIMIT_DATABASE_PERMISSION";
export const limitDatabasePermission = createThunkAction(
  LIMIT_DATABASE_PERMISSION,
  (groupId, entityId, newValue) => dispatch => {
    if (newValue) {
      dispatch(
        updateDataPermission({
          groupId,
          permission: { type: "access", permission: "data" },
          value: newValue,
          entityId,
        }),
      );
    }

    dispatch(push(getGroupFocusPermissionsUrl(groupId, entityId)));
  },
);

const UPDATE_DATA_PERMISSION =
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
          }),
        );
      }

      const metadata = getMetadataWithHiddenTables(getState(), null);
      if (permissionInfo.postActions) {
        const action = permissionInfo.postActions?.[value]?.(
          entityId,
          groupId,
          view,
        );
        if (action) {
          dispatch(action);
          return;
        }
      }

      trackPermissionChange(
        entityId,
        permissionInfo.permission,
        permissionInfo.type === "native",
        value,
      );

      return { groupId, permissionInfo, value, metadata, entityId };
    };
  },
);

const SAVE_DATA_PERMISSIONS =
  "metabase/admin/permissions/data/SAVE_DATA_PERMISSIONS";
export const saveDataPermissions = createThunkAction(
  SAVE_DATA_PERMISSIONS,
  () => async (_dispatch, getState) => {
    MetabaseAnalytics.trackStructEvent("Permissions", "save");
    const {
      dataPermissions,
      dataPermissionsRevision,
    } = getState().admin.permissions;
    const result = await PermissionsApi.updateGraph({
      groups: dataPermissions,
      revision: dataPermissionsRevision,
    });

    return result;
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
  namespace => async (_dispatch, getState) => {
    MetabaseAnalytics.trackStructEvent("Permissions", "save");
    const {
      collectionPermissions,
      collectionPermissionsRevision,
    } = getState().admin.permissions;
    const result = await CollectionsApi.updateGraph({
      namespace,
      revision: collectionPermissionsRevision,
      groups: collectionPermissions,
    });
    return result;
  },
);

const CLEAR_SAVE_ERROR = "metabase/admin/permissions/CLEAR_SAVE_ERROR";
export const clearSaveError = createAction(CLEAR_SAVE_ERROR);

const savePermission = {
  next: _state => null,
  throw: (_state, { payload }) =>
    (payload && typeof payload.data === "string"
      ? payload.data
      : payload.data.message) || t`Sorry, an error occurred.`,
};

const saveError = handleActions(
  {
    [SAVE_DATA_PERMISSIONS]: savePermission,
    [LOAD_DATA_PERMISSIONS]: {
      next: state => null,
    },
    [SAVE_COLLECTION_PERMISSIONS]: savePermission,
    [LOAD_COLLECTION_PERMISSIONS]: {
      next: state => null,
    },
    [CLEAR_SAVE_ERROR]: { next: () => null },
  },
  null,
);

function getDecendentCollections(collection) {
  const subCollections = collection.children.filter(
    collection => !collection.is_personal,
  );
  return subCollections.concat(...subCollections.map(getDecendentCollections));
}

const dataPermissions = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_DATA_PERMISSIONS]: { next: (_state, { payload }) => payload.groups },
    [UPDATE_DATA_PERMISSION]: {
      next: (state, { payload }) => {
        if (payload == null) {
          return state;
        }

        const { value, groupId, entityId, metadata, permissionInfo } = payload;

        const database = metadata.database(entityId.databaseId);

        if (permissionInfo.type === "native") {
          return updateNativePermission(
            state,
            groupId,
            entityId,
            value,
            database,
            permissionInfo.permission,
          );
        }

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
    [SAVE_DATA_PERMISSIONS]: { next: (_state, { payload }) => payload.groups },
  },
  null,
);

const dataPermissionsRevision = handleActions(
  {
    [LOAD_DATA_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
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
        const { groupId, collection, value, shouldPropagate } = payload;
        let newPermissions = assocIn(state, [groupId, collection.id], value);

        if (shouldPropagate) {
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
      next: (_state, { payload }) => payload.groups,
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

export default combineReducers({
  saveError,
  dataPermissions,
  originalDataPermissions,
  dataPermissionsRevision,
  collectionPermissions,
  originalCollectionPermissions,
  collectionPermissionsRevision,
});
