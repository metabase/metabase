/* @flow */

import { createEntity } from "metabase/lib/entities";

export default createEntity({
  name: "questions",
  path: "/api/card",

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});
