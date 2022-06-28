import { createEntity } from "metabase/lib/entities";

const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  path: "/api/action",
});

export default Actions;
