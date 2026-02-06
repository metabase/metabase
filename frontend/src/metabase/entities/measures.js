import {
  measureApi,
  useGetMeasureQuery,
  useListMeasuresQuery,
} from "metabase/api";
import { color } from "metabase/lib/colors";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { MeasureSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";

/**
 * @deprecated use "metabase/api" instead
 */
export const Measures = createEntity({
  name: "measures",
  nameOne: "measure",
  path: "/api/measure",
  schema: MeasureSchema,

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery: useListMeasuresQuery,
  },

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        measureApi.endpoints.listMeasures,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        measureApi.endpoints.getMeasure,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        measureApi.endpoints.createMeasure,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        measureApi.endpoints.updateMeasure,
      ),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).measure(entityId),
  },

  objectSelectors: {
    getName: (measure) => measure && measure.name,
    getColor: () => color("summarize"),
  },
});

const useGetQuery = ({ id }, options) => {
  return useGetMeasureQuery(id, options);
};
