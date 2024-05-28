import { assocIn } from "icepick";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";

import { ApplicationPermissionsApi } from "./api";

const INITIALIZE_APPLICATION_PERMISSIONS =
  "metabase-enterprise/general-permissions/INITIALIZE_APPLICATION_PERMISSIONS";
export const initializeApplicationPermissions = createThunkAction(
  INITIALIZE_APPLICATION_PERMISSIONS,
  () => async dispatch => {
    dispatch(loadApplicationPermissions());
  },
);

const LOAD_APPLICATION_PERMISSIONS =
  "metabase-enterprise/general-permissions/LOAD_APPLICATION_PERMISSIONS";
export const loadApplicationPermissions = createThunkAction(
  LOAD_APPLICATION_PERMISSIONS,
  () => () => {
    return ApplicationPermissionsApi.graph();
  },
);

const UPDATE_APPLICATION_PERMISSION =
  "metabase-enterprise/general-permissions/UPDATE_APPLICATION_PERMISSION";
export const updateApplicationPermission = createAction(
  UPDATE_APPLICATION_PERMISSION,
  ({ groupId, permission, value }) => {
    MetabaseAnalytics.trackStructEvent("General Permissions", "save");
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
  () => async (_dispatch, getState) => {
    MetabaseAnalytics.trackStructEvent("General Permissions", "save");

    const { applicationPermissions, applicationPermissionsRevision } =
      getState().plugins.applicationPermissionsPlugin;

    const result = await ApplicationPermissionsApi.updateGraph({
      groups: applicationPermissions,
      revision: applicationPermissionsRevision,
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

export default combineReducers({
  applicationPermissions,
  originalApplicationPermissions,
  applicationPermissionsRevision,
});
