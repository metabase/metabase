import { createEntity } from "metabase/lib/entities";

import { MetricSchema } from "metabase/schema";

export default createEntity({
  name: "metrics",
  path: "/api/metric",
  schema: MetricSchema,
});
