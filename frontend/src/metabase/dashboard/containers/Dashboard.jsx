/* @flow */

// TODO: merge with metabase/dashboard/components/Dashboard.jsx

import React, { Component } from "react";
import cx from "classnames";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DashboardGrid from "metabase/dashboard/components/DashboardGrid";
import DashboardData from "metabase/dashboard/hoc/DashboardData";

import type { Dashboard as _Dashboard } from "metabase-types/types/Dashboard";
import type { Parameter } from "metabase-types/types/Parameter";

type Props = {
  location?: { query: { [key: string]: string } },
  dashboardId: string,

  dashboard?: _Dashboard,
  parameters: Parameter[],
  parameterValues: { [key: string]: string },

  initialize: () => void,
  isFullscreen: boolean,
  isNightMode: boolean,
  fetchDashboard: (
    dashId: string,
    query?: { [key: string]: string },
  ) => Promise<void>,
  fetchDashboardCardData: (options: {
    reload: boolean,
    clear: boolean,
  }) => Promise<void>,
  setParameterValue: (id: string, value: string) => void,
  setErrorPage: (error: { status: number }) => void,

  className?: string,
  style?: { [property: string]: any },
};

export class Dashboard extends Component {
  props: Props;

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
          <DashboardGrid
            dashboard={dashboard}
            {...props}
            className={"spread"}
          />
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default DashboardData(Dashboard);
