import { createEntity } from "metabase/lib/entities";

const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",
});

export default Groups;
