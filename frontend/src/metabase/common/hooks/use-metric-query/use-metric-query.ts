import Metrics from "metabase/entities/metrics";
import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { MetricId } from "metabase-types/api";
import Metric from "metabase-lib/metadata/Metric";

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
