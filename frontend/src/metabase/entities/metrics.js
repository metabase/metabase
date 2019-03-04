import { createEntity } from "metabase/lib/entities";

import { MetricSchema } from "metabase/schema";
import colors from "metabase/lib/colors";

const Metrics = createEntity({
  name: "metrics",
  path: "/api/metric",
  schema: MetricSchema,

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Metrics.actions.update(
        { id },
        {
          archived,
          // NOTE: this is still required by the endpoint even though we don't really use it
          revision_message: archived ? "(Archive)" : "(Unarchive)",
        },
        opts,
      ),

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
