/* @flow */

import { createEntity } from "metabase/lib/entities";

export default createEntity({
  name: "users",
  path: "/api/user",

  getName: user => `${user.first_name} ${user.last_name}`,

  form: {
    fields: [{ name: "first_name", placeholder: "Johnny" }, { name: "last_name", placeholder: "Appleseed" }, { name: "email", placeholder: "youlooknicetoday@email.com" }],
  },
});
