import { assocIn } from "icepick";

import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { GeneralPermissionsApi } from "./api";

const INITIALIZE_GENERAL_PERMISSIONS =
  "metabase-enterprise/general-permissions/INITIALIZE_GENERAL_PERMISSIONS";
export const initializeGeneralPermissions = createThunkAction(
  INITIALIZE_GENERAL_PERMISSIONS,
  () => async dispatch => {
    dispatch(loadGeneralPermissions());
  },
);

const LOAD_GENERAL_PERMISSIONS =
  "metabase-enterprise/general-permissions/LOAD_GENERAL_PERMISSIONS";
export const loadGeneralPermissions = createThunkAction(
  LOAD_GENERAL_PERMISSIONS,
  () => () => {
    return GeneralPermissionsApi.graph();
  },
);

const UPDATE_GENERAL_PERMISSION =
  "metabase-enterprise/general-permissions/UPDATE_GENERAL_PERMISSION";
export const updateGeneralPermission = createAction(
  UPDATE_GENERAL_PERMISSION,
  ({ groupId, permission, value }) => {
    MetabaseAnalytics.trackStructEvent("General Permissions", "save");
    return {
      groupId,
      permission: permission.permission,
      value,
    };
  },
);

const SAVE_GENERAL_PERMISSIONS =
  "metabase-enterprise/general-permissions/data/SAVE_GENERAL_PERMISSIONS";
export const saveGeneralPermissions = createThunkAction(
  SAVE_GENERAL_PERMISSIONS,
  () => async (_dispatch, getState) => {
    MetabaseAnalytics.trackStructEvent("General Permissions", "save");

    const {
      generalPermissions,
      generalPermissionsRevision,
    } = getState().plugins.generalPermissionsPlugin;

    const result = await GeneralPermissionsApi.updateGraph({
      groups: generalPermissions,
      revision: generalPermissionsRevision,
    });

    return result;
  },
);

const generalPermissions = handleActions(
  {
    [LOAD_GENERAL_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_GENERAL_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [UPDATE_GENERAL_PERMISSION]: {
      next: (state, { payload }) => {
        const { groupId, permission, value } = payload;
        return assocIn(state, [groupId, permission], value);
      },
    },
  },
  null,
);

const originalGeneralPermissions = handleActions(
  {
    [LOAD_GENERAL_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
    [SAVE_GENERAL_PERMISSIONS]: {
      next: (_state, { payload }) => payload.groups,
    },
  },
  null,
);

const generalPermissionsRevision = handleActions(
  {
    [LOAD_GENERAL_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
    [SAVE_GENERAL_PERMISSIONS]: {
      next: (_state, { payload }) => payload.revision,
    },
  },
  null,
);

export default combineReducers({
  generalPermissions,
  originalGeneralPermissions,
  generalPermissionsRevision,
});
