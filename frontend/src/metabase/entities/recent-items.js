import { activityApi } from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { entityTypeForObject } from "metabase/lib/schema";
import { RecentItemSchema } from "metabase/schema";

export const getEntity = item => {
  const entities = require("metabase/entities");
  return entities[entityTypeForObject(item)];
};

export const getName = item => {
  return item.model_object.display_name || item.model_object.name;
};

export const getIcon = item => {
  const entity = getEntity(item);
  const options = { variant: "secondary" };
  return entity.objectSelectors.getIcon(item.model_object, options);
};

/**
 * @deprecated use "metabase/api" instead
 */
const RecentItems = createEntity({
  name: "recentItems",
  nameOne: "recentItem",
  path: "/api/activity/recent_views",
  schema: RecentItemSchema,

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        activityApi.endpoints.listRecentItems,
      ),
  },

  wrapEntity(item, dispatch = null) {
    const entity = getEntity(item);
    return entity.wrapEntity(item, dispatch);
  },

  objectSelectors: {
    getName,
    getIcon,
  },
});

export default RecentItems;
