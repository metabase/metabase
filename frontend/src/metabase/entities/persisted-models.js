import { createSelector } from "reselect";
import { PersistedModelSchema } from "metabase/schema";
import { createEntity } from "metabase/lib/entities";
import { CardApi, PersistedModelsApi } from "metabase/services";

const REFRESH_CACHE = "metabase/entities/persistedModels/REFRESH_CACHE";

const getPersistedModelInfoByModelId = createSelector(
  [
    state => Object.values(state.entities.persistedModels),
    (state, props) => props.entityId,
  ],
  (persistedModels, modelId) =>
    persistedModels.find(info => info.card_id === modelId),
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

  reducer: (state = {}, { type, payload }) => {
    if (type === REFRESH_CACHE) {
      return {
        ...state,
        [payload.id]: {
          ...state[payload.id],
          state: "refreshing",
        },
      };
    }
    return state;
  },
});

export default PersistedModels;
