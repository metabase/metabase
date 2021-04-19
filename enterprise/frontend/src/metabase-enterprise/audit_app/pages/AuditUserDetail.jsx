/* eslint-disable react/prop-types */
import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTable from "../containers/AuditTable";

import EntityName from "metabase/entities/containers/EntityName";

import * as UserDetailCards from "../lib/cards/user_detail";

type Props = {
  params: { [key: string]: string },
};

const AuditUserDetail = ({ params, ...props }: Props) => {
  const userId = parseInt(params.userId);
  return (
    <AuditContent
      {...props}
      title={
        <EntityName
          entityType="users"
          entityId={userId}
          property={"common_name"}
        />
      }
      tabs={AuditUserDetail.tabs}
      userId={userId}
    />
  );
};

const AuditUserActivityTab = ({ userId }) => (
  <AuditDashboard
    cards={[
      // [{ x: 0, y: 0, w: 4, h: 4 }, UserDetailCards.questions(userId)],
      // [{ x: 4, y: 0, w: 4, h: 4 }, UserDetailCards.dashboards(userId)],
      // [{ x: 8, y: 0, w: 4, h: 4 }, UserDetailCards.pulses(userId)],
      // [{ x: 12, y: 0, w: 4, h: 4 }, UserDetailCards.collections(userId)],
      [
        { x: 0, y: 0, w: 8, h: 8 },
        UserDetailCards.mostViewedDashboards(userId),
      ],
      [{ x: 8, y: 0, w: 8, h: 8 }, UserDetailCards.mostViewedQuestions(userId)],
      [{ x: 0, y: 8, w: 16, h: 8 }, UserDetailCards.objectViewsByTime(userId)],
    ]}
  />
);

const AuditUserQueryViewsTab = ({ userId }) => (
  <AuditTable table={UserDetailCards.queryViews(userId)} />
);

const AuditUserDashboardViewsTab = ({ userId }) => (
  <AuditTable table={UserDetailCards.dashboardViews(userId)} />
);

const AuditUserDownloadsTab = ({ userId }) => (
  <AuditTable table={UserDetailCards.downloads(userId)} />
);

AuditUserDetail.tabs = [
  { path: "activity", title: "Activity", component: AuditUserActivityTab },
  { path: "details", title: "Account details" },
  { path: "data_permissions", title: "Data permissions" },
  { path: "collection_permissions", title: "Collection permissions" },
  { path: "made_by", title: "Made by them" },
  {
    path: "query_views",
    title: "Query views",
    component: AuditUserQueryViewsTab,
  },
  {
    path: "dashboard_views",
    title: "Dashboard views",
    component: AuditUserDashboardViewsTab,
  },
  {
    path: "downloads",
    title: "Downloads",
    component: AuditUserDownloadsTab,
  },
];

export default AuditUserDetail;
