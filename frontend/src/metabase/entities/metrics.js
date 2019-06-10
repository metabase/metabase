import { createEntity } from "metabase/lib/entities";

import { MetricSchema } from "metabase/schema";
import colors from "metabase/lib/colors";

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
    getName: segment => segment && segment.name,
    getUrl: segment => null,
    getColor: () => colors["text-medium"],
    getIcon: question => "sum",
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Metrics;
