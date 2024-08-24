/* eslint-disable react/prop-types */

import cx from "classnames";

import Loading from "metabase/components/Loading";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";

export function Dashboard({ dashboard, className, style, ...props }) {
  return (
    <Loading
      className={cx(DashboardS.Dashboard, CS.p1, CS.flexFull, className)}
      style={style}
      loading={!dashboard}
    >
      {() => (
        <DashboardGridConnected
          dashboard={dashboard}
          {...props}
          className={CS.spread}
        />
      )}
    </Loading>
  );
}
