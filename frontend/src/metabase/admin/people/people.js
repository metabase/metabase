import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
  momentifyTimestamps,
  momentifyObjectsTimestamps,
} from "metabase/lib/redux";
import { normalize, schema } from "normalizr";

import MetabaseAnalytics from "metabase/lib/analytics";
import { isMetaBotGroup } from "metabase/lib/groups";

import { SessionApi, UserApi, PermissionsApi } from "metabase/services";

import _ from "underscore";
import { assoc, dissoc } from "icepick";

const user = new schema.Entity("user");

// action constants
export const CREATE_USER = "metabase/admin/people/CREATE_USER";
export const FETCH_USERS = "metabase/admin/people/FETCH_USERS";
export const DEACTIVATE_USER = "metabase/admin/people/DEACTIVATE_USER";
export const REACTIVATE_USER = "metabase/admin/people/REACTIVATE_USER";
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

export const createUser = createThunkAction(
  CREATE_USER,
  user => async (dispatch, getState) => {
    // apply any user defaults here
    user.is_superuser = false;

    let newUser = await UserApi.create(user);

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
  },
);

export const deactivateUser = createThunkAction(
  DEACTIVATE_USER,
  user => async () => {
    await UserApi.delete({
      userId: user.id,
    });

    MetabaseAnalytics.trackEvent("People Admin", "User Removed");

    // NOTE: DELETE doesn't return the object, so just fake it:
    return { ...user, is_active: false };
  },
);

export const reactivateUser = createThunkAction(
  REACTIVATE_USER,
  user => async () => {
    const newUser = await UserApi.reactivate({
      userId: user.id,
    });

    MetabaseAnalytics.trackEvent("People Admin", "User Reactivated");

    return newUser;
  },
);

export const fetchUsers = createThunkAction(FETCH_USERS, () => async () => {
  let users = await UserApi.list({ include_deactivated: true });
  return normalize(users, [user]);
});

export const resendInvite = createThunkAction(
  RESEND_INVITE,
  user => async () => {
    MetabaseAnalytics.trackEvent("People Admin", "Resent Invite");
    return await UserApi.send_invite({ id: user.id });
  },
);

export const resetPasswordManually = createThunkAction(
  RESET_PASSWORD_MANUAL,
  (user, password) => async () => {
    MetabaseAnalytics.trackEvent("People Admin", "Manual Password Reset");
    return await UserApi.update_password({ id: user.id, password: password });
  },
);

export const resetPasswordViaEmail = createThunkAction(
  RESET_PASSWORD_EMAIL,
  user => async () => {
    MetabaseAnalytics.trackEvent("People Admin", "Trigger User Password Reset");
    return await SessionApi.forgot_password({ email: user.email });
  },
);

export const updateUser = createThunkAction(UPDATE_USER, user => async () => {
  MetabaseAnalytics.trackEvent("People Admin", "Update Updated");
  const newUser = await UserApi.update(user);
  return newUser;
});

const modal = handleActions(
  {
    [SHOW_MODAL]: { next: (state, { payload }) => payload },
  },
  null,
);

const TIMESTAMP_KEYS = [
  "date_joined",
  "last_login",
  "updated_at",
  "created_at",
];

const users = handleActions(
  {
    [FETCH_USERS]: {
      next: (state, { payload }) =>
        momentifyObjectsTimestamps(payload.entities.user, TIMESTAMP_KEYS),
    },
    [CREATE_USER]: {
      next: (state, { payload: user }) =>
        assoc(state, user.id, momentifyTimestamps(user, TIMESTAMP_KEYS)),
    },
    [DEACTIVATE_USER]: {
      next: (state, { payload: user }) =>
        assoc(state, user.id, momentifyTimestamps(user, TIMESTAMP_KEYS)),
    },
    [REACTIVATE_USER]: {
      next: (state, { payload: user }) =>
        assoc(state, user.id, momentifyTimestamps(user, TIMESTAMP_KEYS)),
    },
    [UPDATE_USER]: {
      next: (state, { payload: user }) =>
        assoc(state, user.id, momentifyTimestamps(user, TIMESTAMP_KEYS)),
    },
  },
  null,
);

const groups = handleActions(
  {
    [LOAD_GROUPS]: {
      next: (state, { payload }) =>
        payload && payload.filter(group => !isMetaBotGroup(group)),
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
