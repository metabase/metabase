import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as DashboardCards from "../lib/cards/dashboards";

const AuditDashboards = props => (
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
    placeholder={t`Dashboard name`}
    table={DashboardCards.table()}
  />
);

AuditDashboards.tabs = [
  {
    path: "overview",
    title: t`Overview`,
    component: AuditDashboardsOverviewTab,
  },
  {
    path: "all",
    title: t`All dashboards`,
    component: AuditDashboardsAllTab,
  },
];

export default AuditDashboards;
