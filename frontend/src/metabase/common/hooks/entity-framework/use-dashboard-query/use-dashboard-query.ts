import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/entity-framework/use-entity-query";
import Dashboards from "metabase/entities/dashboards";
import type { DashboardId, Dashboard } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
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
