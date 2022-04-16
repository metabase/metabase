import Metric, {
  IMetric,
  HydratedMetricProperties,
} from "metabase-lib/lib/metadata/Metric";

import { PRODUCTS } from "__support__/sample_database_fixture";

export function createMockMetricInstance(
  metricProps?: Partial<IMetric>,
  hydratedProps?: Partial<HydratedMetricProperties>,
): Metric {
  const metric = new Metric({
    name: "Avg of Product Rating",
    id: 1,
    table_id: PRODUCTS.id,
    archived: false,
    description: "This is an average",
    definition: {
      "source-table": PRODUCTS.id,
      aggregation: [["avg", ["field", PRODUCTS.RATING.id, null]]],
    },
    ...metricProps,
  });

  metric.table = PRODUCTS;

  return Object.assign(metric, hydratedProps);
}
