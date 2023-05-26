import Metrics from "metabase/entities/metrics";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import Metric from "metabase-lib/metadata/Metric";

export const useMetricListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<Metric> => {
  return useEntityListQuery(props, {
    fetchList: Metrics.actions.fetchList,
    getList: Metrics.selectors.getList,
    getLoading: Metrics.selectors.getLoading,
    getLoaded: Metrics.selectors.getLoaded,
    getError: Metrics.selectors.getError,
  });
};
