import Metrics from "metabase/entities/metrics";
import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/use-entity-list-query";
import type Metric from "metabase-lib/metadata/Metric";

export const useMetricListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<Metric> => {
  return useEntityListQuery(props, {
    fetchList: Metrics.actions.fetchList,
    getList: Metrics.selectors.getList,
    getLoading: Metrics.selectors.getLoading,
    getLoaded: Metrics.selectors.getLoaded,
    getError: Metrics.selectors.getError,
    getListMetadata: Metrics.selectors.getListMetadata,
  });
};
