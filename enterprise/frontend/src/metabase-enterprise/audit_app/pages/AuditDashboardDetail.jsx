import React from "react";
import PropTypes from "prop-types";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTable from "../containers/AuditTable";

import OpenInMetabase from "../components/OpenInMetabase";

import Dashboard from "metabase/entities/dashboards";

import * as Urls from "metabase/lib/urls";

import * as DashboardCards from "../lib/cards/dashboard_detail";

const tabPropTypes = {
  dashboardId: PropTypes.number.isRequired,
};

AuditDashboardDetail.propTypes = {
  params: PropTypes.shape(tabPropTypes),
};

function AuditDashboardDetail({ params, ...props }) {
  const dashboardId = parseInt(params.dashboardId);
  return (
    <Dashboard.Loader id={dashboardId} wrapped>
      {({ dashboard }) => (
        <AuditContent
          {...props}
          title={dashboard.getName()}
          subtitle={<OpenInMetabase to={Urls.dashboard(dashboard)} />}
          tabs={AuditDashboardDetail.tabs}
          dashboardId={dashboardId}
        />
      )}
    </Dashboard.Loader>
  );
}

AuditDashboardActivityTab.propTypes = tabPropTypes;

function AuditDashboardActivityTab({ dashboardId }) {
  return (
    <AuditDashboard
      cards={[
        [{ x: 0, y: 0, w: 18, h: 10 }, DashboardCards.viewsByTime(dashboardId)],
      ]}
    />
  );
}

AuditDashboardRevisionsTab.propTypes = tabPropTypes;

function AuditDashboardRevisionsTab({ dashboardId }) {
  return <AuditTable table={DashboardCards.revisionHistory(dashboardId)} />;
}

AuditDashboardAuditLogTab.propTypes = tabPropTypes;

function AuditDashboardAuditLogTab({ dashboardId }) {
  return <AuditTable table={DashboardCards.auditLog(dashboardId)} />;
}

AuditDashboardDetail.tabs = [
  { path: "activity", title: "Activity", component: AuditDashboardActivityTab },
  { path: "details", title: "Details" },
  {
    path: "revisions",
    title: "Revision history",
    component: AuditDashboardRevisionsTab,
  },
  { path: "log", title: "Audit log", component: AuditDashboardAuditLogTab },
];

export default AuditDashboardDetail;
