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

// backend returns type = "card" instead of "question"
const backendTypeToEntitiesName = object =>
  object.type === "card" ? "questions" : `${object.type}s`;

export default createEntity({
  name: "search",
  path: "/api/search",

  schema: new schema.Union(
    {
      questions: QuestionSchema,
      dashboards: DashboardSchema,
      pulses: PulseSchema,
      collections: CollectionSchema,
      segments: SegmentSchema,
      metrics: MetricSchema,
    },
    (object, parent, key) => backendTypeToEntitiesName(object),
  ),

  // delegate to the actual object's entity wrapEntity
  wrapEntity(object, dispatch) {
    const entities = require("metabase/entities");
    // NOTE: special case card -> questions
    const type = backendTypeToEntitiesName(object);
    const entity = entities[type];
    return entity.wrapEntity(object, dispatch);
  },
});
