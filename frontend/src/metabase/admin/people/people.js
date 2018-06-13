import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";
import { normalize, schema } from "normalizr";

import MetabaseAnalytics from "metabase/lib/analytics";

import { SessionApi, UserApi, PermissionsApi } from "metabase/services";

import moment from "moment";
import _ from "underscore";
import { assoc, dissoc } from "icepick";

const user = new schema.Entity("user");

// action constants
export const CREATE_USER = "metabase/admin/people/CREATE_USER";
export const DELETE_USER = "metabase/admin/people/DELETE_USER";
export const FETCH_USERS = "metabase/admin/people/FETCH_USERS";
export const RESEND_INVITE = "metabase/admin/people/RESEND_INVITE";
export const RESET_PASSWORD_EMAIL =
  "metabase/admin/people/RESET_PASSWORD_EMAIL";
export const RESET_PASSWORD_MANUAL =
  "metabase/admin/people/RESET_PASSWORD_MANUAL";
export const SHOW_MODAL = "metabase/admin/people/SHOW_MODAL";
export const UPDATE_USER = "metabase/admin/people/UPDATE_USER";
export const LOAD_GROUPS = "metabase/admin/people/LOAD_GROUPS";
export const LOAD_MEMBERSHIPS = "metabase/admin/people/LOAD_MEMBERSHIPS";
export const LOAD_GROUP_DETAILS = "metabase/admin/people/LOAD_GROUP_DETAILS";

export const CREATE_MEMBERSHIP = "metabase/admin/people/CREATE_MEMBERSHIP";
export const DELETE_MEMBERSHIP = "metabase/admin/people/DELETE_MEMBERSHIP";

// action creators

export const showModal = createAction(SHOW_MODAL);

export const loadGroups = createAction(LOAD_GROUPS, () =>
  PermissionsApi.groups(),
);

export const loadGroupDetails = createAction(LOAD_GROUP_DETAILS, id =>
  PermissionsApi.groupDetails({ id: id }),
);

export const loadMemberships = createAction(LOAD_MEMBERSHIPS, async () =>
  // flatten the map of user id => memberships
  _.chain(await PermissionsApi.memberships())
    .values()
    .flatten()
    .map(m => [m.membership_id, m])
    .object()
    .value(),
);
export const createMembership = createAction(
  CREATE_MEMBERSHIP,
  async ({ userId, groupId }) => {
    // pull the membership_id from the list of all memberships of the group
    let groupMemberships = await PermissionsApi.createMembership({
      user_id: userId,
      group_id: groupId,
    });
    MetabaseAnalytics.trackEvent("People Groups", "Membership Added");
    return {
      user_id: userId,
      group_id: groupId,
      membership_id: _.findWhere(groupMemberships, { user_id: userId })
        .membership_id,
    };
  },
);
export const deleteMembership = createAction(
  DELETE_MEMBERSHIP,
  async ({ membershipId }) => {
    await PermissionsApi.deleteMembership({ id: membershipId });
    MetabaseAnalytics.trackEvent("People Groups", "Membership Deleted");
    return membershipId;
  },
);

export const createUser = createThunkAction(CREATE_USER, function(user) {
  return async function(dispatch, getState) {
    // apply any user defaults here
    user.is_superuser = false;

    let newUser = await UserApi.create(user);
    newUser.date_joined = newUser.date_joined
      ? moment(newUser.date_joined)
      : null;
    newUser.last_login = newUser.last_login ? moment(newUser.last_login) : null;

    if (user.groups) {
      await Promise.all(
        user.groups.map(groupId =>
          dispatch(createMembership({ userId: newUser.id, groupId: groupId })),
        ),
      );
    }

    MetabaseAnalytics.trackEvent(
      "People Admin",
      "User Added",
      user.password !== null ? "password" : "email",
    );

    return newUser;
  };
});

export const deleteUser = createThunkAction(DELETE_USER, function(user) {
  return async function(dispatch, getState) {
    await UserApi.delete({
      userId: user.id,
    });

    MetabaseAnalytics.trackEvent("People Admin", "User Removed");
    return user;
  };
});

export const fetchUsers = createThunkAction(FETCH_USERS, function() {
  return async function(dispatch, getState) {
    let users = await UserApi.list();

    for (let u of users) {
      u.date_joined = u.date_joined ? moment(u.date_joined) : null;
      u.last_login = u.last_login ? moment(u.last_login) : null;
    }

    return normalize(users, [user]);
  };
});

export const resendInvite = createThunkAction(RESEND_INVITE, function(user) {
  return async function(dispatch, getState) {
    MetabaseAnalytics.trackEvent("People Admin", "Resent Invite");
    return await UserApi.send_invite({ id: user.id });
  };
});

export const resetPasswordManually = createThunkAction(
  RESET_PASSWORD_MANUAL,
  function(user, password) {
    return async function(dispatch, getState) {
      MetabaseAnalytics.trackEvent("People Admin", "Manual Password Reset");
      return await UserApi.update_password({ id: user.id, password: password });
    };
  },
);

export const resetPasswordViaEmail = createThunkAction(
  RESET_PASSWORD_EMAIL,
  function(user) {
    return async function(dispatch, getState) {
      MetabaseAnalytics.trackEvent(
        "People Admin",
        "Trigger User Password Reset",
      );
      return await SessionApi.forgot_password({ email: user.email });
    };
  },
);

export const updateUser = createThunkAction(UPDATE_USER, function(user) {
  return async function(dispatch, getState) {
    let updatedUser = await UserApi.update(user);

    updatedUser.date_joined = updatedUser.date_joined
      ? moment(updatedUser.date_joined)
      : null;
    updatedUser.last_login = updatedUser.last_login
      ? moment(updatedUser.last_login)
      : null;

    MetabaseAnalytics.trackEvent("People Admin", "Update Updated");

    return updatedUser;
  };
});

const modal = handleActions(
  {
    [SHOW_MODAL]: { next: (state, { payload }) => payload },
  },
  null,
);

const users = handleActions(
  {
    [FETCH_USERS]: {
      next: (state, { payload }) => ({ ...payload.entities.user }),
    },
    [CREATE_USER]: {
      next: (state, { payload: user }) => ({ ...state, [user.id]: user }),
    },
    [DELETE_USER]: {
      next: (state, { payload: user }) => _.omit(state, user.id),
    },
    [UPDATE_USER]: {
      next: (state, { payload: user }) => ({ ...state, [user.id]: user }),
    },
  },
  null,
);

const groups = handleActions(
  {
    [LOAD_GROUPS]: {
      next: (state, { payload }) =>
        payload && payload.filter(group => group.name !== "MetaBot"),
    },
  },
  null,
);

const memberships = handleActions(
  {
    [LOAD_MEMBERSHIPS]: {
      next: (state, { payload: memberships }) => memberships,
    },
    [CREATE_MEMBERSHIP]: {
      next: (state, { payload: membership }) =>
        assoc(state, membership.membership_id, membership),
    },
    [DELETE_MEMBERSHIP]: {
      next: (state, { payload: membershipId }) => dissoc(state, membershipId),
    },
  },
  {},
);

const group = handleActions(
  {
    [LOAD_GROUP_DETAILS]: { next: (state, { payload }) => payload },
  },
  null,
);

export default combineReducers({
  modal,
  users,
  groups,
  group,
  memberships,
});
