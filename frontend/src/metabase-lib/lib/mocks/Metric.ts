import Metric, {
  HydratedMetricProperties,
} from "metabase-lib/lib/metadata/Metric";
import { IMetric } from "metabase-types/api";
import { createMockMetric } from "metabase-types/api/mocks";
import { PRODUCTS, metadata } from "__support__/sample_database_fixture";

export function createMockMetricInstance(
  metricProps?: Partial<IMetric>,
  hydratedProps?: Partial<HydratedMetricProperties>,
): Metric {
  const metric = createMockMetric(metricProps);
  const instance = new Metric(metric);

  instance.table = PRODUCTS;
  instance.metadata = metadata;

  return Object.assign(instance, hydratedProps);
}
