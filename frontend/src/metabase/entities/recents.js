import { createEntity } from "metabase/lib/entities";
import { RecentsSchema } from "metabase/schema";

const Recents = createEntity({
  name: "recents",
  nameOne: "recent",
  path: "/api/activity/recent_views",
  schema: RecentsSchema,
});

export default Recents;
