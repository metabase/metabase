import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as DatabasesCards from "../lib/cards/databases";

type Props = {
  params: { [key: string]: string },
};

const AuditDatabases = (props: Props) => (
  <AuditContent {...props} title="Databases" tabs={AuditDatabases.tabs} />
);

const AuditDatabasesOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 18, h: 6 }, DatabasesCards.totalQueryExecutionsByDb()],
      [
        { x: 0, y: 6, w: 18, h: 6 },
        DatabasesCards.queryExecutionsPerDbPerDay(),
      ],
    ]}
  />
);

const AuditDatabasesAllTab = () => (
  <AuditTableWithSearch
    placeholder={`Database name`}
    table={DatabasesCards.table()}
  />
);

AuditDatabases.tabs = [
  { path: "overview", title: "Overview", component: AuditDatabasesOverviewTab },
  { path: "all", title: "All databases", component: AuditDatabasesAllTab },
];

export default AuditDatabases;
