import { createEntity } from "metabase/lib/entities";

import { schema } from "normalizr";

import {
  QuestionSchema,
  DashboardSchema,
  PulseSchema,
  CollectionSchema,
} from "metabase/schema";
import {
  CardApi,
  DashboardApi,
  PulseApi,
  CollectionsApi,
} from "metabase/services";

export default createEntity({
  name: "search",
  path: "/api/search",

  schema: new schema.Union(
    {
      questions: QuestionSchema,
      dashboards: DashboardSchema,
      pulses: PulseSchema,
      collections: CollectionSchema,
    },
    (object, parent, key) => `${object.type}s`,
  ),

  // delegate to the actual object's entity wrapEntity
  wrapEntity(object, dispatch) {
    const entities = require("metabase/entities");
    // NOTE: special case card -> questions
    const type = object.type === "card" ? "questions" : `${object.type}s`;
    const entity = entities[type];
    return entity.wrapEntity(object, dispatch);
  },
});
