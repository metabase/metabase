import { createEntity } from "metabase/lib/entities";
import { CacheConfigSchema } from "metabase/schema";
import { CacheConfigApi } from "metabase/services";
// TODO: Is any of this needed? I based this file on model-indexes.ts
// import type { IndexedEntity } from "metabase-types/api/modelIndexes";
// import * as actions from "./actions";
// import * as utils from "./utils";

export const CacheConfigs = createEntity({
  name: "cacheConfigs",
  nameOne: "cacheConfig",
  path: "/api/ee/caching",
  schema: CacheConfigSchema,
  api: {
    ...CacheConfigApi,
    list: () => CacheConfigApi.list(),
  },
  // actions,
  // utils,
  // TODO: Are these right?
  writableProperties: ["name", "value_ref", "pk_ref", "model_id"],
  objectSelectors: {
    // TODO: Needed?
    // getUrl: (entity: IndexedEntity) => `/model/${entity.model_id}/${entity.id}`,
    // getIcon: () => ({ name: "beaker" }),
  },
  reducer: (state = {}) => {
    return state;
  },
});
