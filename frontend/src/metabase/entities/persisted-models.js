import { PersistedModelSchema } from "metabase/schema";
import { createEntity } from "metabase/lib/entities";
import { CardApi } from "metabase/services";

const REFRESH_CACHE = "metabase/entities/persistedModels/REFRESH_CACHE";

const PersistedModels = createEntity({
  name: "persistedModels",
  nameOne: "persistedModel",
  path: "/api/persist",
  schema: PersistedModelSchema,

  objectActions: {
    refreshCache: async job => {
      await CardApi.refreshModelCache({ id: job.card_id });
      return { type: REFRESH_CACHE, payload: job };
    },
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
