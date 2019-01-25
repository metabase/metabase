/* @flow */

import { createEntity } from "metabase/lib/entities";
import { t } from "c-3po";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";

import { SessionApi } from "metabase/services";

const User = createEntity({
  name: "users",
  path: "/api/user",

  objectSelectors: {
    getName: user => `${user.first_name} ${user.last_name}`,
  },

  actionDecorators: {
    create: {
      // if the instance doesn't have
      pre: user => {
        let newUser = user;
        if (!MetabaseSettings.isEmailConfigured()) {
          newUser.password = MetabaseUtils.generatePassword();
        }
        return newUser;
      },
      post: ({ result }, user) => {
        return { ...user, id: result };
      },
    },
  },
  objectActions: {
    passwordResetEmail: async ({ email }) => {
      return await SessionApi.forgot_password({ email });
    },
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
    ],
  },
});

export default User;
