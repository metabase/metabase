import { createEntity } from "metabase/lib/entities";

const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  path: "/api/actions",
});

export default Actions;
