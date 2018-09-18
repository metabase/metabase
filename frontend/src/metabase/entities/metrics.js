import { createEntity } from "metabase/lib/entities";

import { MetricSchema } from "metabase/schema";
import colors from "metabase/lib/colors";

export default createEntity({
  name: "metrics",
  path: "/api/metric",
  schema: MetricSchema,

  objectSelectors: {
    getName: segment => segment && segment.name,
    getUrl: segment => null,
    getColor: () => colors["text-medium"],
    getIcon: question => "metric",
  },
});
