/* eslint-disable react/prop-types */
// TODO: merge with metabase/dashboard/components/Dashboard.jsx

import { Component } from "react";
import cx from "classnames";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";

export class Dashboard extends Component {
  render() {
    const { dashboard, className, style, ...props } = this.props;

    return (
      <LoadingAndErrorWrapper
        className={cx("Dashboard p1 flex-full", className)}
        style={style}
        loading={!dashboard}
        noBackground
      >
        {() => (
          <DashboardGridConnected
            dashboard={dashboard}
            {...props}
            className="spread"
          />
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
