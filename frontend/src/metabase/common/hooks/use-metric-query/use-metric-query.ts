import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import Metrics from "metabase/entities/metrics";
import type Metric from "metabase-lib/v1/metadata/Metric";
import type { MetricId } from "metabase-types/api";

export const useMetricQuery = (
  props: UseEntityQueryProps<MetricId>,
): UseEntityQueryResult<Metric> => {
  return useEntityQuery(props, {
    fetch: Metrics.actions.fetch,
    getObject: Metrics.selectors.getObject,
    getLoading: Metrics.selectors.getLoading,
    getError: Metrics.selectors.getError,
  });
};
