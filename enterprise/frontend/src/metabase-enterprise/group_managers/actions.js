import { push } from "react-router-redux";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { permissionApi } from "metabase/api";
import { createThunkAction } from "metabase/lib/redux";

import {
  getRevokeManagerGroupsRedirect,
  getRevokeManagerPeopleRedirect,
  getRevokedAllGroupManagersPath,
} from "./utils";

export const CONFIRM_DELETE_MEMBERSHIP =
  "metabase-enterprise/group_managers/CONFIRM_DELETE_MEMBERSHIP";
export const confirmDeleteMembership = createThunkAction(
  CONFIRM_DELETE_MEMBERSHIP,
  (membership, currentUserMemberships, view) => async (dispatch, getState) => {
    await dispatch(
      permissionApi.endpoints.deleteMembership.initiate(membership),
    ).unwrap();

    const adminPaths = getAdminPaths(getState());

    const redirectUrl =
      view === "people"
        ? getRevokeManagerPeopleRedirect(currentUserMemberships, adminPaths)
        : getRevokeManagerGroupsRedirect(currentUserMemberships, adminPaths);

    if (redirectUrl) {
      await dispatch(push(redirectUrl));
    }
  },
);

export const CONFIRM_UPDATE_MEMBERSHIP =
  "metabase-enterprise/group_managers/CONFIRM_UPDATE_MEMBERSHIP";
export const confirmUpdateMembership = createThunkAction(
  CONFIRM_UPDATE_MEMBERSHIP,
  (membership, currentUserMemberships, view) => async (dispatch, getState) => {
    await dispatch(
      permissionApi.endpoints.updateMembership.initiate(membership),
    ).unwrap();

    const adminPaths = getAdminPaths(getState());

    const redirectUrl =
      view === "people"
        ? getRevokeManagerPeopleRedirect(currentUserMemberships, adminPaths)
        : getRevokeManagerGroupsRedirect(currentUserMemberships, adminPaths);

    if (redirectUrl) {
      await dispatch(push(redirectUrl));
    }
  },
);

export const DELETE_GROUP = "metabase-enterprise/group_managers/DELETE_GROUP";
export const deleteGroup = createThunkAction(
  DELETE_GROUP,
  (group, groupCount) => async (dispatch, getState) => {
    const isLastGroup = groupCount === 1;

    await dispatch(
      permissionApi.endpoints.deletePermissionsGroup.initiate(group.id),
    ).unwrap();

    if (isLastGroup) {
      const adminPaths = getAdminPaths(getState());
      const redirectUrl = getRevokedAllGroupManagersPath(adminPaths);
      await dispatch(push(redirectUrl));
    }
  },
);
