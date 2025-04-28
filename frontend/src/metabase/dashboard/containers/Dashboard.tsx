import cx from "classnames";

import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  DashboardGridConnected,
  type DashboardGridProps,
} from "metabase/dashboard/components/DashboardGrid";
import type { Dashboard as IDashboard } from "metabase-types/api";

export function Dashboard({
  dashboard,
  ...props
}: {
  dashboard: IDashboard;
} & DashboardGridProps) {
  return (
    <LoadingAndErrorWrapper
      className={cx(DashboardS.Dashboard, CS.p1, CS.flexFull)}
      loading={!dashboard}
      noBackground
    >
      {() => <DashboardGridConnected dashboard={dashboard} {...props} />}
    </LoadingAndErrorWrapper>
  );
}
