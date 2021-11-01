import { createEntity } from "metabase/lib/entities";
import { entityTypeForObject } from "metabase/lib/schema";
import { RecentsSchema } from "metabase/schema";

const Recents = createEntity({
  name: "recents",
  nameOne: "recent",
  path: "/api/activity/recent_views",
  schema: RecentsSchema,
  // delegate to the actual object's entity wrapEntity
  wrapEntity(object, dispatch = null) {
    const entities = require("metabase/entities");
    const entity = entities[entityTypeForObject(object)];
    if (entity) {
      return entity.wrapEntity(object, dispatch);
    } else {
      console.warn("Couldn't find entity for object", object);
      return object;
    }
  },
});

export default Recents;
