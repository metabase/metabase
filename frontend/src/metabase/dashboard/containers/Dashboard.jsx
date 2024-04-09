/* eslint-disable react/prop-types */

import cx from "classnames";
import { Component } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";

export class Dashboard extends Component {
  render() {
    const { dashboard, className, style, ...props } = this.props;

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
}
