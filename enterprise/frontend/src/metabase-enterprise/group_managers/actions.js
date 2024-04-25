import { push } from "react-router-redux";

import { getAdminPaths } from "metabase/admin/app/selectors";
import {
  deleteMembership,
  updateMembership,
} from "metabase/admin/people/people";
import Groups from "metabase/entities/groups";
import { createThunkAction } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";

import {
  getRevokeManagerGroupsRedirect,
  getRevokeManagerPeopleRedirect,
  getRevokedAllGroupManagersPath,
} from "./utils";

export const CONFIRM_DELETE_MEMBERSHIP =
  "metabase-enterprise/group_managers/CONFIRM_DELETE_MEMBERSHIP";
export const confirmDeleteMembership = createThunkAction(
  CONFIRM_DELETE_MEMBERSHIP,
  (membershipId, currentUserMemberships, view) => async (dispatch, getState) => {
    await dispatch(deleteMembership(membershipId));
    await dispatch(refreshCurrentUser());

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
    await dispatch(updateMembership(membership));
    await dispatch(refreshCurrentUser());

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
  group => async (dispatch, getState) => {
    const groups = Groups.selectors.getList(getState());
    const isLastGroup = groups.length === 1;

    await dispatch(Groups.actions.delete({ id: group.id }));
    await dispatch(refreshCurrentUser());

    if (isLastGroup) {
      const adminPaths = getAdminPaths(getState());
      const redirectUrl = getRevokedAllGroupManagersPath(adminPaths);
      await dispatch(push(redirectUrl));
    }
  },
);
