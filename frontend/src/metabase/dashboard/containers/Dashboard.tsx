/* eslint-disable react/prop-types */

import cx from "classnames";
import type { CSSProperties } from "react";

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
  className,
  style,
  ...props
}: {
  dashboard: IDashboard;
  className?: string;
  style?: CSSProperties;
} & DashboardGridProps) {
  return (
    <LoadingAndErrorWrapper
      className={cx(DashboardS.Dashboard, CS.p1, CS.flexFull, className)}
      style={style}
      loading={!dashboard}
      noBackground
    >
      {() => <DashboardGridConnected dashboard={dashboard} {...props} />}
    </LoadingAndErrorWrapper>
  );
}
