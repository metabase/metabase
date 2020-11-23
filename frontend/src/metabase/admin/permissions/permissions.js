import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { t } from "ttag";
import { PermissionsApi } from "metabase/services";
import Group from "metabase/entities/groups";

const RESET = "metabase/admin/permissions/RESET";
export const reset = createAction(RESET);

const INITIALIZE = "metabase/admin/permissions/INITIALIZE";
export const initialize = createThunkAction(
  INITIALIZE,
  (load, save) => async (dispatch, getState) => {
    dispatch(reset({ load, save }));
    await Promise.all([
      dispatch(loadPermissions()),
      dispatch(Group.actions.fetchList()),
    ]);
  },
);

const LOAD_GROUPS = "metabase/admin/permissions/LOAD_GROUPS";
export const loadGroups = createAction(LOAD_GROUPS, () =>
  PermissionsApi.groups(),
);

const LOAD_PERMISSIONS = "metabase/admin/permissions/LOAD_PERMISSIONS";
export const loadPermissions = createThunkAction(
  LOAD_PERMISSIONS,
  () => async (dispatch, getState) => {
    const { load } = getState().admin.permissions;
    return load();
  },
);

const UPDATE_PERMISSION = "metabase/admin/permissions/UPDATE_PERMISSION";
export const updatePermission = createThunkAction(
  UPDATE_PERMISSION,
  ({ groupId, entityId, value, updater, postAction }) => async (
    dispatch,
    getState,
  ) => {
    if (postAction) {
      const action = postAction(groupId, entityId, value);
      if (action) {
        dispatch(action);
      }
    }
    return updater(groupId, entityId, value);
  },
);

const SAVE_PERMISSIONS = "metabase/admin/permissions/SAVE_PERMISSIONS";
export const savePermissions = createThunkAction(
  SAVE_PERMISSIONS,
  () => async (dispatch, getState) => {
    MetabaseAnalytics.trackEvent("Permissions", "save");
    const { permissions, revision, save } = getState().admin.permissions;
    const result = await save({
      revision: revision,
      groups: permissions,
    });
    return result;
  },
);

const SET_PROPAGATE_PERMISSIONS =
  "metabase/admin/permissions/SET_PROPAGATE_PERMISSIONS";
export const setPropagatePermissions = createAction(SET_PROPAGATE_PERMISSIONS);

const CLEAR_SAVE_ERROR = "metabase/admin/permissions/CLEAR_SAVE_ERROR";
export const clearSaveError = createAction(CLEAR_SAVE_ERROR);

const save = handleActions(
  {
    [RESET]: { next: (state, { payload }) => payload.save },
  },
  null,
);
const load = handleActions(
  {
    [RESET]: { next: (state, { payload }) => payload.load },
  },
  null,
);

const permissions = handleActions(
  {
    [RESET]: { next: () => null },
    [LOAD_PERMISSIONS]: { next: (state, { payload }) => payload.groups },
    [SAVE_PERMISSIONS]: { next: (state, { payload }) => payload.groups },
    [UPDATE_PERMISSION]: { next: (state, { payload }) => payload },
  },
  null,
);

const originalPermissions = handleActions(
  {
    [RESET]: { next: () => null },
    [LOAD_PERMISSIONS]: { next: (state, { payload }) => payload.groups },
    [SAVE_PERMISSIONS]: { next: (state, { payload }) => payload.groups },
  },
  null,
);

const revision = handleActions(
  {
    [RESET]: { next: () => null },
    [LOAD_PERMISSIONS]: { next: (state, { payload }) => payload.revision },
    [SAVE_PERMISSIONS]: { next: (state, { payload }) => payload.revision },
  },
  null,
);

const saveError = handleActions(
  {
    [RESET]: { next: () => null },
    [SAVE_PERMISSIONS]: {
      next: state => null,
      throw: (state, { payload }) =>
        (payload && typeof payload.data === "string"
          ? payload.data
          : payload.data.message) || t`Sorry, an error occurred.`,
    },
    [LOAD_PERMISSIONS]: {
      next: state => null,
    },
    [CLEAR_SAVE_ERROR]: { next: () => null },
  },
  null,
);

const propagatePermissions = handleActions(
  {
    [SET_PROPAGATE_PERMISSIONS]: { next: (state, { payload }) => payload },
  },
  true,
);

export default combineReducers({
  save,
  load,

  permissions,
  originalPermissions,
  saveError,
  revision,

  propagatePermissions,
});
