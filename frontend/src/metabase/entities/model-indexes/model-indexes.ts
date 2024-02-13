/**
 * A Model index is a separate entity in the metabase backend which is used to index a particular field
 * in a model in connection with a primary key, so that the model can be queried by the indexed field.
 * This allows us to use search results to show a particular record in the model.
 */

import type { IndexedEntity } from "metabase-types/api/modelIndexes";

import { createEntity } from "metabase/lib/entities";
import { ModelIndexApi } from "metabase/services";
import { ModelIndexSchema } from "metabase/schema";

import * as actions from "./actions";
import * as utils from "./utils";

export const ModelIndexes = createEntity({
  name: "modelIndexes",
  nameOne: "modelIndex",
  path: "/api/model-index",
  schema: ModelIndexSchema,
  api: {
    ...ModelIndexApi,
  },
  actions,
  utils,
  writableProperties: ["name", "value_ref", "pk_ref", "model_id"],
  objectSelectors: {
    getUrl: (entity: IndexedEntity) => `/model/${entity.model_id}/${entity.id}`,
    getIcon: () => ({ name: "beaker" }),
  },
  reducer: (state = {}) => {
    return state;
  },
});
