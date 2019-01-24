/* @flow */

import { createEntity } from "metabase/lib/entities";
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
      { name: "first_name", placeholder: "Johnny" },
      { name: "last_name", placeholder: "Appleseed" },
      { name: "email", placeholder: "youlooknicetoday@email.com" },
    ],
  },
});

export default User;
