import { assocIn } from "icepick";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
  combineReducers,
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import { ApplicationPermissionsApi } from "./api";

const INITIALIZE_APPLICATION_PERMISSIONS =
  "metabase-enterprise/general-permissions/INITIALIZE_APPLICATION_PERMISSIONS";
export const initializeApplicationPermissions = createThunkAction(
  INITIALIZE_APPLICATION_PERMISSIONS,
  () => async (dispatch) => {
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

    const result = await ApplicationPermissionsApi.updateGraph({
      groups: applicationPermissions,
      revision: applicationPermissionsRevision,
    }).catch((error) => {
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
