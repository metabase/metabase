import { metricApi } from "metabase/api";
import { color } from "metabase/lib/colors";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { MetricSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";

/**
 * @deprecated use "metabase/api" instead
 */
const Metrics = createEntity({
  name: "metrics",
  nameOne: "metric",
  path: "/api/legacy-metric",
  schema: MetricSchema,

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        metricApi.endpoints.listMetrics,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        metricApi.endpoints.getMetric,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        metricApi.endpoints.createMetric,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        metricApi.endpoints.updateMetric,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(id, dispatch, metricApi.endpoints.deleteMetric),
  },

  objectActions: {
    setArchived: (
      { id },
      archived,
      { revision_message = archived ? "(Archive)" : "(Unarchive)" } = {},
    ) => Metrics.actions.update({ id }, { archived, revision_message }),

    // NOTE: DELETE not currently implemented
    delete: null,
  },

  objectSelectors: {
    getName: metric => metric && metric.name,
    getUrl: metric => `/metric/${metric.id}`,
    getColor: metric => color("summarize"),
    getIcon: metric => ({ name: "sum" }),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).metric(entityId),
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Metrics;
