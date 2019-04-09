/* @flow */

import { t } from "c-3po";
import { assocIn } from "icepick";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";

import { createEntity } from "metabase/lib/entities";

import { UserApi, SessionApi } from "metabase/services";

import FormGroupsWidget from "metabase/components/form/widgets/FormGroupsWidget";

export const DEACTIVATE = "metabase/entities/users/DEACTIVATE";
export const REACTIVATE = "metabase/entities/users/REACTIVATE";
export const PASSWORD_RESET_EMAIL =
  "metabase/entities/users/PASSWORD_RESET_EMAIL";
export const PASSWORD_RESET_MANUAL =
  "metabase/entities/users/RESET_PASSWORD_MANUAL";
export const RESEND_INVITE = "metabase/entities/users/RESEND_INVITE";

const Users = createEntity({
  name: "users",
  nameOne: "user",

  path: "/api/user",

  objectSelectors: {
    getName: user => user.common_name || `${user.first_name} ${user.last_name}`,
  },

  actionTypes: {
    DEACTIVATE,
    REACTIVATE,
    PASSWORD_RESET_EMAIL,
    PASSWORD_RESET_MANUAL,
    RESEND_INVITE,
  },

  actionDecorators: {
    create: thunkCreator => user => async (dispatch, getState) => {
      if (!MetabaseSettings.isEmailConfigured()) {
        user = {
          ...user,
          password: MetabaseUtils.generatePassword(),
        };
      }
      const result = await thunkCreator(user)(dispatch, getState);
      return {
        // HACK: include user ID and password for temporaryPasswords reducer
        id: result.result,
        password: user.password,
        ...result,
      };
    },
    update: thunkCreator => (...args) => async (dispatch, getState) => {
      const result = await thunkCreator(...args)(dispatch, getState);
      // HACK: reload memberships when updating a user
      // TODO: only do this if group_ids changes
      dispatch(require("metabase/admin/people/people").loadMemberships());
      return result;
    },
  },

  objectActions: {
    resentInvite: async ({ id }) => {
      MetabaseAnalytics.trackEvent("People Admin", "Resent Invite");
      await UserApi.send_invite({ id });
      return { type: RESEND_INVITE };
    },
    passwordResetEmail: async ({ email }) => {
      MetabaseAnalytics.trackEvent(
        "People Admin",
        "Trigger User Password Reset",
      );
      await SessionApi.forgot_password({ email });
      return { type: PASSWORD_RESET_EMAIL };
    },
    passwordResetManual: async (
      { id },
      password = MetabaseUtils.generatePassword(),
    ) => {
      MetabaseAnalytics.trackEvent("People Admin", "Manual Password Reset");
      await UserApi.update_password({ id, password });
      return { type: PASSWORD_RESET_MANUAL, payload: { id, password } };
    },
    deactivate: async ({ id }) => {
      MetabaseAnalytics.trackEvent("People Admin", "User Removed");
      // TODO: move these APIs from services to this file
      await UserApi.delete({ userId: id });
      return { type: DEACTIVATE, payload: { id } };
    },
    reactivate: async ({ id }) => {
      MetabaseAnalytics.trackEvent("People Admin", "User Reactivated");
      // TODO: move these APIs from services to this file
      const user = await UserApi.reactivate({ userId: id });
      return { type: REACTIVATE, payload: user };
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === DEACTIVATE && !error) {
      return assocIn(state, [payload.id, "is_active"], false);
    } else if (type === REACTIVATE && !error) {
      return assocIn(state, [payload.id, "is_active"], true);
    } else if (type === PASSWORD_RESET_MANUAL && !error) {
      return assocIn(state, [payload.id, "password"], payload.password);
    }
    return state;
  },

  form: {
    fields: [
      {
        name: "first_name",
        placeholder: "Johnny",
        validate: name =>
          (!name && t`First name is required`) ||
          (name.length > 100 && t`Must be 100 characters or less`),
      },
      {
        name: "last_name",
        placeholder: "Appleseed",
        validate: name =>
          (!name && t`Last name is required`) ||
          (name.length > 100 && t`Must be 100 characters or less`),
      },
      {
        name: "email",
        placeholder: "youlooknicetoday@email.com",
        validate: email => !email && t`Email is required`,
      },
      {
        name: "group_ids",
        title: "Groups",
        type: FormGroupsWidget,
      },
    ],
  },
});

export default Users;
