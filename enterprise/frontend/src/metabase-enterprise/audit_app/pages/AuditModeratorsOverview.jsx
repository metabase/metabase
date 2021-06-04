import React from "react";

import AuditContent from "../components/AuditContent";

function AuditModeratorsOverview(props) {
  return (
    <AuditContent
      {...props}
      title="Moderators"
      tabs={AuditModeratorsOverview.tabs}
    />
  );
}

function AuditModeratorsTab() {
  return <div />;
}

function AuditModeratorGroupsTab() {
  return <div />;
}

AuditModeratorsOverview.tabs = [
  { path: "users", title: "Moderators", component: AuditModeratorsTab },
  { path: "groups", title: "Groups", component: AuditModeratorGroupsTab },
];

export default AuditModeratorsOverview;
