import _ from "underscore";

import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import { PLUGIN_ADMIN_USER_FORM_FIELDS } from "metabase/plugins";
import validate from "metabase/lib/validate";
import FormGroupsWidget from "metabase/components/form/widgets/FormGroupsWidget";

const NAME_FIELDS = [
  {
    name: "first_name",
    title: t`First name`,
    placeholder: "Johnny",
    autoFocus: true,
    validate: validate.required().maxLength(100),
  },
  {
    name: "last_name",
    title: t`Last name`,
    placeholder: "Appleseed",
    validate: validate.required().maxLength(100),
  },
];

const EMAIL_FIELD = {
  name: "email",
  title: t`Email`,
  placeholder: "youlooknicetoday@email.com",
  validate: validate.required().email(),
};

const LOCALE_FIELD = {
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
};

const PASSWORD_FORM_FIELDS = [
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
      ...NAME_FIELDS,
      EMAIL_FIELD,
      {
        name: "group_ids",
        title: t`Groups`,
        type: FormGroupsWidget,
      },
      ...PLUGIN_ADMIN_USER_FORM_FIELDS,
    ],
  },
  user: {
    fields: [...NAME_FIELDS, EMAIL_FIELD, LOCALE_FIELD],
    disablePristineSubmit: true,
  },
  setup: {
    fields: [
      ...NAME_FIELDS,
      EMAIL_FIELD,
      {
        name: "site_name",
        title: t`Company or team name`,
        placeholder: t`Department of Awesome`,
        validate: validate.required(),
      },
      ...PASSWORD_FORM_FIELDS,
    ],
  },
  setup_invite: user => ({
    fields: [
      ...NAME_FIELDS,
      {
        name: "email",
        title: t`Email`,
        placeholder: "youlooknicetoday@email.com",
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
  password_forgot: {
    fields: [
      {
        name: "email",
        title: t`Email address`,
        placeholder: "The email you use for your Metabase account",
        validate: validate.required().email(),
      },
    ],
  },
  password_reset: {
    fields: [...PASSWORD_FORM_FIELDS],
  },
};
