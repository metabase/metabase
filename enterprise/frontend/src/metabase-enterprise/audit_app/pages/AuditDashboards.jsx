import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as DashboardCards from "../lib/cards/dashboards";

type Props = {
  params: { [key: string]: string },
};

const AuditDashboards = (props: Props) => (
  <AuditContent {...props} title="Dashboards" tabs={AuditDashboards.tabs} />
);

const AuditDashboardsOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 18, h: 7 }, DashboardCards.viewsAndSavesByTime()],
      [{ x: 0, y: 7, w: 11, h: 9 }, DashboardCards.mostPopularAndSpeed()],
      [{ x: 12, y: 7, w: 6, h: 9 }, DashboardCards.mostCommonQuestions()],
    ]}
  />
);

const AuditDashboardsAllTab = () => (
  <AuditTableWithSearch
    placeholder={`Dashboard name`}
    table={DashboardCards.table()}
  />
);

AuditDashboards.tabs = [
  {
    path: "overview",
    title: "Overview",
    component: AuditDashboardsOverviewTab,
  },
  {
    path: "all",
    title: "All dashboards",
    component: AuditDashboardsAllTab,
  },
];

export default AuditDashboards;
