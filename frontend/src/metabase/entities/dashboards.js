/* @flow */

import { createEntity } from "metabase/lib/entities";

export default createEntity({
  name: "dashboards",
  path: "/api/dashboard",

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});
