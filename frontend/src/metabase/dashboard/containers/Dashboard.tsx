import cx from "classnames";
import type { CSSProperties } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  DashboardGridConnected,
  type DashboardGridProps,
} from "metabase/dashboard/components/DashboardGrid";

interface DashboardProps extends DashboardGridProps {
  className?: string;
  style?: CSSProperties;
}

export function Dashboard({
  dashboard,
  className,
  style,
  ...props
}: DashboardProps) {
  return (
    <LoadingAndErrorWrapper
      className={cx(DashboardS.Dashboard, CS.p1, CS.flexFull, className)}
      style={style}
      loading={!dashboard}
      noBackground
    >
      {() => (
        <DashboardGridConnected
          dashboard={dashboard}
          {...props}
          className={CS.spread}
        />
      )}
    </LoadingAndErrorWrapper>
  );
}
