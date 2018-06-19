/* @flow */

import { createEntity } from "metabase/lib/entities";

export default createEntity({
  name: "users",
  path: "/api/user",

  getName: user => `${user.first_name} ${user.last_name}`,

  form: {
    fields: [{ name: "first_name" }, { name: "last_name" }, { name: "email" }],
  },
});
