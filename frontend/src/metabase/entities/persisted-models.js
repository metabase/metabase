import { createSelector } from "@reduxjs/toolkit";
import { PersistedModelSchema } from "metabase/schema";
import { createEntity } from "metabase/lib/entities";
import { CardApi, PersistedModelsApi } from "metabase/services";

const REFRESH_CACHE = "metabase/entities/persistedModels/REFRESH_CACHE";

const getPersistedModelInfoByModelId = createSelector(
  [state => state.entities.persistedModels, (state, props) => props.entityId],
  (persistedModels, modelId) =>
    Object.values(persistedModels).find(info => info.card_id === modelId),
);

const PersistedModels = createEntity({
  name: "persistedModels",
  nameOne: "persistedModel",
  path: "/api/persist",
  schema: PersistedModelSchema,

  api: {
    get: ({ id, type }, ...args) => {
      return type === "byModelId"
        ? PersistedModelsApi.getForModel({ id }, ...args)
        : PersistedModelSchema.get({ id }, ...args);
    },
  },

  objectActions: {
    refreshCache: async job => {
      await CardApi.refreshModelCache({ id: job.card_id });
      return { type: REFRESH_CACHE, payload: job };
    },
  },

  selectors: {
    getByModelId: getPersistedModelInfoByModelId,
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === REFRESH_CACHE && !error) {
      return {
        ...state,
        [payload.id]: {
          ...state[payload.id],
          state: "refreshing",
          refresh_begin: new Date().toUTCString(),
          refresh_end: null,
        },
      };
    }
    return state;
  },
});

export default PersistedModels;
