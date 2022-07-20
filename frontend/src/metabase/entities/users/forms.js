import _ from "underscore";

import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import {
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_IS_PASSWORD_USER,
} from "metabase/plugins";
import validate from "metabase/lib/validate";
import FormGroupsWidget from "metabase/components/form/widgets/FormGroupsWidget";

const getNameFields = () => [
  {
    name: "first_name",
    title: t`First name`,
    placeholder: "Johnny",
    autoFocus: true,
    validate: validate.maxLength(100),
    normalize: firstName => firstName || null,
  },
  {
    name: "last_name",
    title: t`Last name`,
    placeholder: "Appleseed",
    validate: validate.maxLength(100),
    normalize: lastName => lastName || null,
  },
];

const getEmailField = () => ({
  name: "email",
  title: t`Email`,
  placeholder: "nicetoseeyou@email.com",
  validate: validate.required().email(),
});

const getLocaleField = () => ({
  name: "locale",
  title: t`Language`,
  type: "select",
  options: [
    [null, t`Use site default`],
    ..._.sortBy(
      MetabaseSettings.get("available-locales") || [["en", "English"]],
      ([code, name]) => name,
    ),
  ].map(([code, name]) => ({ name, value: code })),
});

const getPasswordFields = () => [
  {
    name: "password",
    title: t`Create a password`,
    type: "password",
    placeholder: t`Shhh...`,
    validate: validate.required().passwordComplexity(),
  },
  {
    name: "password_confirm",
    title: t`Confirm your password`,
    type: "password",
    placeholder: t`Shhh... but one more time so we get it right`,
    validate: (password_confirm, { values: { password } = {} }) => {
      if (!password_confirm) {
        return t`required`;
      } else if (password_confirm !== password) {
        return t`passwords do not match`;
      }
    },
  },
];

export default {
  admin: {
    fields: [
      ...getNameFields(),
      getEmailField(),
      {
        name: "user_group_memberships",
        title: t`Groups`,
        type: FormGroupsWidget,
      },
      ...PLUGIN_ADMIN_USER_FORM_FIELDS,
    ],
  },
  user: user => {
    const isSsoUser = !PLUGIN_IS_PASSWORD_USER.every(predicate =>
      predicate(user),
    );
    const fields = isSsoUser
      ? [getLocaleField()]
      : [...getNameFields(), getEmailField(), getLocaleField()];

    return {
      fields,
      disablePristineSubmit: true,
    };
  },
  setup: () => ({
    fields: [
      ...getNameFields(),
      getEmailField(),
      {
        name: "site_name",
        title: t`Company or team name`,
        placeholder: t`Department of Awesome`,
        validate: validate.required(),
      },
      ...getPasswordFields(),
    ],
  }),
  setup_invite: user => ({
    fields: [
      ...getNameFields(),
      {
        name: "email",
        title: t`Email`,
        placeholder: "nicetoseeyou@email.com",
        validate: email => {
          if (!email) {
            return t`required`;
          } else if (!MetabaseUtils.isEmail(email)) {
            return t`must be a valid email address`;
          } else if (email === user.email) {
            return t`must be different from the email address you used in setup`;
          }
        },
      },
    ],
  }),
  login: () => {
    const ldap = MetabaseSettings.isLdapConfigured();
    const cookies = MetabaseSettings.get("session-cookies");

    return {
      fields: [
        {
          name: "username",
          type: ldap ? "input" : "email",
          title: ldap ? t`Username or email address` : t`Email address`,
          placeholder: "nicetoseeyou@email.com",
          validate: ldap ? validate.required() : validate.required().email(),
          autoFocus: true,
        },
        {
          name: "password",
          type: "password",
          title: t`Password`,
          placeholder: t`Shhh...`,
          validate: validate.required(),
        },
        {
          name: "remember",
          type: "checkbox",
          title: t`Remember me`,
          initial: true,
          hidden: cookies,
          horizontal: true,
          align: "left",
        },
      ],
    };
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
      ...getPasswordFields(),
    ],
  },
  password_forgot: {
    fields: [
      {
        name: "email",
        title: t`Email address`,
        placeholder: t`The email you use for your Metabase account`,
        validate: validate.required().email(),
      },
    ],
  },
  password_reset: {
    fields: [...getPasswordFields()],
  },
  newsletter: {
    fields: [
      {
        name: "email",
        placeholder: "nicetoseeyou@email.com",
        autoFocus: true,
        validate: validate.required().email(),
      },
    ],
  },
};
