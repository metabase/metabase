import { createEntity } from "metabase/lib/entities";

import { MetricSchema } from "metabase/schema";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { getMetadata } from "metabase/selectors/metadata";

const Metrics = createEntity({
  name: "metrics",
  nameOne: "metric",
  path: "/api/metric",
  schema: MetricSchema,

  objectActions: {
    setArchived: (
      { id },
      archived,
      { revision_message = archived ? "(Archive)" : "(Unarchive)" } = {},
    ) => Metrics.actions.update({ id }, { archived, revision_message }),

    // NOTE: DELETE not currently implemented
    // $FlowFixMe: no official way to disable builtin actions yet
    delete: null,
  },

  objectSelectors: {
    getName: metric => metric && metric.name,
    getUrl: metric =>
      Urls.tableRowsQuery(metric.database_id, metric.table_id, metric.id),
    getColor: metric => color("accent1"),
    getIcon: metric => "sum",
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).metric(entityId),
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Metrics;
