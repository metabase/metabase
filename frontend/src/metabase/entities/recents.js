import { createEntity } from "metabase/lib/entities";
import { entityTypeForObject } from "metabase/lib/schema";
import { RecentsSchema } from "metabase/schema";

const Recents = createEntity({
  name: "recents",
  nameOne: "recent",
  path: "/api/activity/recent_views",
  schema: RecentsSchema,

  wrapEntity(object, dispatch = null) {
    const entity = getEntity(object);
    return entity.wrapEntity(object, dispatch);
  },

  objectSelectors: {
    getIcon,
  },
});

export const getEntity = object => {
  const entities = require("metabase/entities");
  return entities[entityTypeForObject(object)];
};

export const getIcon = object => {
  const entity = getEntity(object);
  return entity.objectSelectors.getIcon(object);
};

export default Recents;
