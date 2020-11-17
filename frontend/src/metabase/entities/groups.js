/* @flow */

import { createEntity } from "metabase/lib/entities";

const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",

  form: {
    fields: [{ name: "name" }],
  },
});

export default Groups;
