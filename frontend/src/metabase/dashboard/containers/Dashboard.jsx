/* eslint-disable react/prop-types */
// TODO: merge with metabase/dashboard/components/Dashboard.jsx

import { Component } from "react";
import cx from "classnames";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DashboardGrid from "metabase/dashboard/components/DashboardGrid";
import DashboardData from "metabase/dashboard/hoc/DashboardData";

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
          <DashboardGrid dashboard={dashboard} {...props} className="spread" />
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default DashboardData(Dashboard);
