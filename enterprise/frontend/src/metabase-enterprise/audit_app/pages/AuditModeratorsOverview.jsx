import React from "react";

import {
  moderatorsTable,
  moderatorGroupsTable,
} from "metabase-enterprise/audit_app/lib/cards/moderation";
import AuditContent from "../components/AuditContent";
import AuditTable from "../containers/AuditTable";

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
  return <AuditTable table={moderatorsTable()} />;
}

function AuditModeratorGroupsTab() {
  return <AuditTable table={moderatorGroupsTable()} />;
}

AuditModeratorsOverview.tabs = [
  { path: "users", title: "Moderators", component: AuditModeratorsTab },
  { path: "groups", title: "Groups", component: AuditModeratorGroupsTab },
];

export default AuditModeratorsOverview;
