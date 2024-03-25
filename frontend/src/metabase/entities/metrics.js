import { color } from "metabase/lib/colors";
import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
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
    getUrl: metric =>
      Urls.tableRowsQuery(metric.database_id, metric.table_id, metric.id),
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
