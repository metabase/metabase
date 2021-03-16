import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTable from "../containers/AuditTable";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as UsersCards from "../lib/cards/users";

type Props = {
  params: { [key: string]: string },
};

const AuditUsers = (props: Props) => (
  <AuditContent {...props} title="Team members" tabs={AuditUsers.tabs} />
);

const AuditUsersOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 18, h: 9 }, UsersCards.activeAndNewByTime()],
      [{ x: 0, y: 9, w: 9, h: 9 }, UsersCards.mostActive()],
      [{ x: 9, y: 9, w: 9, h: 9 }, UsersCards.mostSaves()],
    ]}
  />
);

const AuditUsersAllTab = () => (
  <AuditTableWithSearch
    placeholder={`Member name`}
    table={UsersCards.table()}
  />
);

const AuditUsersAuditLogTab = () => (
  <AuditTable table={UsersCards.auditLog()} />
);

AuditUsers.tabs = [
  { path: "overview", title: "Overview", component: AuditUsersOverviewTab },
  { path: "all", title: "All members", component: AuditUsersAllTab },
  { path: "log", title: "Audit log", component: AuditUsersAuditLogTab },
];

export default AuditUsers;
