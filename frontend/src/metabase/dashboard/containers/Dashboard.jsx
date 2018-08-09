/* @flow */

// TODO: merge with metabase/dashboard/components/Dashboard.jsx

import React, { Component } from "react";
import cx from "classnames";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DashboardGrid from "metabase/dashboard/components/DashboardGrid";
import DashboardData from "metabase/dashboard/hoc/DashboardData";

import type { Dashboard as _Dashboard } from "metabase/meta/types/Dashboard";
import type { Parameter } from "metabase/meta/types/Parameter";

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
};

export class Dashboard extends Component {
  props: Props;

  render() {
    const { dashboard } = this.props;

    return (
      <LoadingAndErrorWrapper
        className={cx("Dashboard p1 flex-full")}
        loading={!dashboard}
        noBackground
      >
        {() => <DashboardGrid {...this.props} className={"spread"} />}
      </LoadingAndErrorWrapper>
    );
  }
}

export default DashboardData(Dashboard);
