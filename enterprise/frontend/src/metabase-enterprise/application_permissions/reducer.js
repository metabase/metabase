import { assocIn } from "icepick";
import { t } from "ttag";

import { permissionApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  combineReducers,
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { applicationPermissionsApi } from "metabase-enterprise/api";

const INITIALIZE_APPLICATION_PERMISSIONS =
  "metabase-enterprise/general-permissions/INITIALIZE_APPLICATION_PERMISSIONS";
export const initializeApplicationPermissions = createThunkAction(
  INITIALIZE_APPLICATION_PERMISSIONS,
  () => async (dispatch) => {
    dispatch(loadApplicationPermissions());
    dispatch(permissionApi.endpoints.listPermissionsGroups.initiate({}));
  },
);

const LOAD_APPLICATION_PERMISSIONS =
  "metabase-enterprise/general-permissions/LOAD_APPLICATION_PERMISSIONS";
export const loadApplicationPermissions = createThunkAction(
  LOAD_APPLICATION_PERMISSIONS,
  () => async (dispatch) =>
    runRtkEndpoint(
      undefined,
      dispatch,
      applicationPermissionsApi.endpoints.getApplicationPermissionsGraph,
    ),
);

const UPDATE_APPLICATION_PERMISSION =
  "metabase-enterprise/general-permissions/UPDATE_APPLICATION_PERMISSION";
export const updateApplicationPermission = createAction(
  UPDATE_APPLICATION_PERMISSION,
  ({ groupId, permission, value }) => {
    return {
      groupId,
      permission: permission.permission,
      value,
    };
  },
);

const SAVE_APPLICATION_PERMISSIONS =
  "metabase-enterprise/general-permissions/data/SAVE_APPLICATION_PERMISSIONS";
export const saveApplicationPermissions = createThunkAction(
  SAVE_APPLICATION_PERMISSIONS,
  () => async (dispatch, getState) => {
    const { applicationPermissions, applicationPermissionsRevision } =
      getState().plugins.applicationPermissionsPlugin;

    const result = await runRtkEndpoint(
      {
        groups: applicationPermissions,
        revision: applicationPermissionsRevision,
      },
      dispatch,
      applicationPermissionsApi.endpoints.updateApplicationPermissionsGraph,
    ).catch((error) => {
      dispatch(
        addUndo({
          icon: "warning",
          message: getErrorMessage(error, t`Error saving permissions`),
        }),
      );
    });

    return result;
  },
);

const applicationPermissions = handleActions(
  {
    [LOAD_APPLICATION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_APPLICATION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [UPDATE_APPLICATION_PERMISSION]: {
      next: (state, { payload }) => {
        const { groupId, permission, value } = payload;
        return assocIn(state, [groupId, permission], value);
      },
    },
  },
  null,
);

const originalApplicationPermissions = handleActions(
  {
    [LOAD_APPLICATION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_APPLICATION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
  },
  null,
);

const applicationPermissionsRevision = handleActions(
  {
    [LOAD_APPLICATION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
    [SAVE_APPLICATION_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
  },
  null,
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  applicationPermissions,
  originalApplicationPermissions,
  applicationPermissionsRevision,
});
