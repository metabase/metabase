import { createEntity } from "metabase/lib/entities";

import { schema } from "normalizr";
import { GET } from "metabase/lib/api";

import {
  QuestionSchema,
  DashboardSchema,
  PulseSchema,
  CollectionSchema,
  SegmentSchema,
  MetricSchema,
} from "metabase/schema";

const SEARCH_ENTITIES_SCHEMA_MAP = {
  questions: QuestionSchema,
  dashboards: DashboardSchema,
  pulses: PulseSchema,
  collections: CollectionSchema,
  segments: SegmentSchema,
  metrics: MetricSchema,
};
const SEARCH_ENTITIES_TYPES = Object.keys(SEARCH_ENTITIES_SCHEMA_MAP);

// backend returns model = "card" instead of "question"
const backendModelToEntityType = model =>
  model === "card" ? "questions" : `${model}s`;

const searchList = GET("/api/search");
const collectionList = GET("/api/collection/:id");

export default createEntity({
  name: "search",
  path: "/api/search",

  api: {
    list: async (query = {}) => {
      let items;
      if (query.collection) {
        if (Object.keys(query).length !== 1) {
          throw new Error(
            "search does not support other filters with `collection`",
          );
        }
        const collection = await collectionList({ id: query.collection });
        items = collection.items;
      } else {
        items = await searchList(query);
      }
      // normalize
      return items.map(item => ({
        // remove this once search endpoint is migrated to use `favorite`
        favorite: item.favorited,
        // remove this once search endpoint is migrated to use `model`
        model: item.type,
        // add "entity_type" that matches the frontend's entity type
        entity_type: backendModelToEntityType(item.model || item.type),
        ...item,
      }));
    },
  },

  schema: new schema.Union(
    SEARCH_ENTITIES_SCHEMA_MAP,
    (object, parent, key) => object.entity_type,
  ),

  // delegate to the actual object's entity wrapEntity
  wrapEntity(object, dispatch = null) {
    const entities = require("metabase/entities");
    const entity = entities[object.entity_type];
    return entity.wrapEntity(object, dispatch);
  },

  // delegate to each entity's actionShouldInvalidateLists
  actionShouldInvalidateLists(action) {
    const entities = require("metabase/entities");
    for (const type of SEARCH_ENTITIES_TYPES) {
      if (entities[type].actionShouldInvalidateLists(action)) {
        return true;
      }
    }
    return false;
  },
});
