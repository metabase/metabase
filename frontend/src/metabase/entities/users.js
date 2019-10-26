/* @flow */

import { t } from "ttag";
import { assocIn } from "icepick";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";

import { createEntity } from "metabase/lib/entities";
import validate from "metabase/lib/validate";

import { UserApi, SessionApi } from "metabase/services";

import FormGroupsWidget from "metabase/components/form/widgets/FormGroupsWidget";

import type { FormFieldDefinition } from "metabase/containers/Form";

export const DEACTIVATE = "metabase/entities/users/DEACTIVATE";
export const REACTIVATE = "metabase/entities/users/REACTIVATE";
export const PASSWORD_RESET_EMAIL =
  "metabase/entities/users/PASSWORD_RESET_EMAIL";
export const PASSWORD_RESET_MANUAL =
  "metabase/entities/users/RESET_PASSWORD_MANUAL";
export const RESEND_INVITE = "metabase/entities/users/RESEND_INVITE";

// TODO: It'd be nice to import loadMemberships, but we need to resolve a circular dependency
function loadMemberships() {
  return require("metabase/admin/people/people").loadMemberships();
}

const DETAILS_FORM_FIELDS: FormFieldDefinition[] = [
  {
    name: "first_name",
    title: t`First name`,
    placeholder: "Johnny",
    validate: validate.required().maxLength(100),
  },
  {
    name: "last_name",
    title: t`Last name`,
    placeholder: "Appleseed",
    validate: validate.required().maxLength(100),
  },
  {
    name: "email",
    title: t`Email`,
    placeholder: "youlooknicetoday@email.com",
    validate: validate.required().email(),
  },
];

const PASSWORD_FORM_FIELDS: FormFieldDefinition[] = [
  {
    name: "password",
    title: t`Enter a password`,
    type: "password",
    placeholder: t`Shh...`,
    validate: validate.required().passwordComplexity(),
  },
  {
    name: "password_confirm",
    title: t`Confirm your password`,
    type: "password",
    placeholder: t`Shh... but one more time`,
    validate: (password_confirm, { values: { password } = {} }) =>
      (!password_confirm && t`required`) ||
      (password_confirm !== password && t`passwords do not match`),
  },
];

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

      dispatch(loadMemberships());
      return {
        // HACK: include user ID and password for temporaryPasswords reducer
        id: result.result,
        password: user.password,
        ...result,
      };
    },
    update: thunkCreator => user => async (dispatch, getState) => {
      const result = await thunkCreator(user)(dispatch, getState);
      if (user.group_ids) {
        // group ids were just updated
        dispatch(loadMemberships());
      }
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

  forms: {
    admin: {
      fields: [
        ...DETAILS_FORM_FIELDS,
        {
          name: "group_ids",
          title: "Groups",
          type: FormGroupsWidget,
        },
      ],
    },
    user: {
      fields: [...DETAILS_FORM_FIELDS],
    },
    setup: {
      fields: [
        ...DETAILS_FORM_FIELDS,
        ...PASSWORD_FORM_FIELDS,
        {
          name: "site_name",
          title: t`Your company or team name`,
          placeholder: t`Department of Awesome`,
          validate: validate.required(),
        },
      ],
    },
    password: {
      fields: [
        {
          name: "old_password",
          type: "password",
          title: t`Current password`,
          placeholder: t`Shhh...`,
          validate: validate.required(),
        },
        ...PASSWORD_FORM_FIELDS,
      ],
    },
    password_reset: { fields: [...PASSWORD_FORM_FIELDS] },
  },
});

export default Users;
