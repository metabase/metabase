import Dashboards from "metabase/entities/dashboards";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { DashboardId, Dashboard } from "metabase-types/api";

export const useDashboardQuery = (
  props: UseEntityQueryProps<DashboardId, null>,
): UseEntityQueryResult<Dashboard> => {
  return useEntityQuery(props, {
    fetch: Dashboards.actions.fetch,
    getObject: Dashboards.selectors.getObject,
    getLoading: Dashboards.selectors.getLoading,
    getError: Dashboards.selectors.getError,
  });
};
