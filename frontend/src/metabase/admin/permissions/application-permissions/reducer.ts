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
  "metabase/application-permissions/INITIALIZE_APPLICATION_PERMISSIONS";
export const initializeApplicationPermissions = createThunkAction(
  INITIALIZE_APPLICATION_PERMISSIONS,
  () => async (dispatch: any) => {
    dispatch(loadApplicationPermissions());
  },
);

const LOAD_APPLICATION_PERMISSIONS =
  "metabase/application-permissions/LOAD_APPLICATION_PERMISSIONS";
export const loadApplicationPermissions = createThunkAction(
  LOAD_APPLICATION_PERMISSIONS,
  () => () => {
    return ApplicationPermissionsApi.graph();
  },
);

const UPDATE_APPLICATION_PERMISSION =
  "metabase/application-permissions/UPDATE_APPLICATION_PERMISSION";
export const updateApplicationPermission = createAction(
  UPDATE_APPLICATION_PERMISSION,
  ({
    groupId,
    permission,
    value,
  }: {
    groupId: number;
    permission: any;
    value: string;
  }) => {
    return {
      groupId,
      permission: permission.permission,
      value,
    };
  },
);

const SAVE_APPLICATION_PERMISSIONS =
  "metabase/application-permissions/SAVE_APPLICATION_PERMISSIONS";
export const saveApplicationPermissions = createThunkAction(
  SAVE_APPLICATION_PERMISSIONS,
  () => async (dispatch: any, getState: any) => {
    const { applicationPermissions, applicationPermissionsRevision } =
      getState().plugins.applicationPermissionsPlugin;

    const result = await ApplicationPermissionsApi.updateGraph({
      groups: applicationPermissions,
      revision: applicationPermissionsRevision,
    }).catch((error: unknown) => {
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
      next: (_state: any, { payload }: { payload: any }) => payload.groups,
    },
    [SAVE_APPLICATION_PERMISSIONS]: {
      next: (_state: any, { payload }: { payload: any }) => payload.groups,
    },
    [UPDATE_APPLICATION_PERMISSION]: {
      next: (state: any, { payload }: { payload: any }) => {
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
      next: (_state: any, { payload }: { payload: any }) => payload.groups,
    },
    [SAVE_APPLICATION_PERMISSIONS]: {
      next: (_state: any, { payload }: { payload: any }) => payload.groups,
    },
  },
  null,
);

const applicationPermissionsRevision = handleActions(
  {
    [LOAD_APPLICATION_PERMISSIONS]: {
      next: (_state: any, { payload }: { payload: any }) => payload.revision,
    },
    [SAVE_APPLICATION_PERMISSIONS]: {
      next: (_state: any, { payload }: { payload: any }) => payload.revision,
    },
  },
  null,
);

// eslint-disable-next-line import/no-default-export
export default combineReducers({
  applicationPermissions,
  originalApplicationPermissions,
  applicationPermissionsRevision,
});
