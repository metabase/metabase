import { push } from "react-router-redux";
import { createThunkAction } from "metabase/lib/redux";
import {
  deleteMembership,
  updateMembership,
} from "metabase/admin/people/people";
import { getAdminPaths } from "metabase/admin/app/selectors";
import { refreshCurrentUser } from "metabase/redux/user";
import {
  getRevokeManagerGroupsRedirect,
  getRevokeManagerPeopleRedirect,
} from "./utils";

export const CONFIRM_DELETE_MEMBERSHIP =
  "metabase-enterprise/group_managers/CONFIRM_DELETE_MEMBERSHIP";
export const confirmDeleteMembership = createThunkAction(
  CONFIRM_DELETE_MEMBERSHIP,
  (membershipId, currentUserMemberships, view) => async (
    dispatch,
    getState,
  ) => {
    await dispatch(deleteMembership(membershipId));

    const adminPaths = getAdminPaths(getState());

    const redirectUrl =
      view === "people"
        ? getRevokeManagerPeopleRedirect(currentUserMemberships, adminPaths)
        : getRevokeManagerGroupsRedirect(currentUserMemberships, adminPaths);

    if (redirectUrl) {
      await dispatch(push(redirectUrl));
      await dispatch(refreshCurrentUser());
    }
  },
);

export const CONFIRM_UPDATE_MEMBERSHIP =
  "metabase-enterprise/group_managers/CONFIRM_UPDATE_MEMBERSHIP";
export const confirmUpdateMembership = createThunkAction(
  CONFIRM_UPDATE_MEMBERSHIP,
  (membership, currentUserMemberships, view) => async (dispatch, getState) => {
    await dispatch(updateMembership(membership));

    const adminPaths = getAdminPaths(getState());

    const redirectUrl =
      view === "people"
        ? getRevokeManagerPeopleRedirect(currentUserMemberships, adminPaths)
        : getRevokeManagerGroupsRedirect(currentUserMemberships, adminPaths);

    if (redirectUrl) {
      await dispatch(push(redirectUrl));
      await dispatch(refreshCurrentUser());
    }
  },
);
