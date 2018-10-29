import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";

import { canEditPermissions } from "metabase/lib/groups";
import MetabaseAnalytics from "metabase/lib/analytics";
import { t } from "c-3po";
import { PermissionsApi } from "metabase/services";

const RESET = "metabase/admin/permissions/RESET";
export const reset = createAction(RESET);

const INITIALIZE = "metabase/admin/permissions/INITIALIZE";
export const initialize = createThunkAction(
  INITIALIZE,
  (load, save) => async (dispatch, getState) => {
    dispatch(reset({ load, save }));
    await Promise.all([dispatch(loadPermissions()), dispatch(loadGroups())]);
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
      let action = postAction(groupId, entityId, value);
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
    let result = await save({
      revision: revision,
      groups: permissions,
    });
    return result;
  },
);

const SET_PROPAGATE_PERMISSIONS =
  "metabase/admin/permissions/SET_PROPAGATE_PERMISSIONS";
export const setPropagatePermissions = createAction(SET_PROPAGATE_PERMISSIONS);

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

const groups = handleActions(
  {
    [LOAD_GROUPS]: {
      next: (state, { payload }) =>
        payload &&
        payload.map(group => ({
          ...group,
          editable: canEditPermissions(group),
        })),
    },
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
  groups,

  propagatePermissions,
});
