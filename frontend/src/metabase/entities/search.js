import { createEntity } from "metabase/lib/entities";

import { schema } from "normalizr";

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
const SEARCH_ENTITIES = Object.keys(SEARCH_ENTITIES_SCHEMA_MAP);

// backend returns type = "card" instead of "question"
const backendTypeToEntitiesName = object =>
  object.type === "card" ? "questions" : `${object.type}s`;

export default createEntity({
  name: "search",
  path: "/api/search",

  schema: new schema.Union(SEARCH_ENTITIES_SCHEMA_MAP, (object, parent, key) =>
    backendTypeToEntitiesName(object),
  ),

  // delegate to the actual object's entity wrapEntity
  wrapEntity(object, dispatch = null) {
    const entities = require("metabase/entities");
    // NOTE: special case card -> questions
    const type = backendTypeToEntitiesName(object);
    const entity = entities[type];
    return entity.wrapEntity(object, dispatch);
  },

  // delegate to each entity's actionShouldInvalidateLists
  actionShouldInvalidateLists(action) {
    const entities = require("metabase/entities");
    for (const type of SEARCH_ENTITIES) {
      if (entities[type].actionShouldInvalidateLists(action)) {
        return true;
      }
    }
    return false;
  },
});
