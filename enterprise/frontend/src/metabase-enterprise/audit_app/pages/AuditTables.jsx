import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as TablesCards from "../lib/cards/tables";

type Props = {
  params: { [key: string]: string },
};

const AuditTables = (props: Props) => (
  <AuditContent {...props} title="Tables" tabs={AuditTables.tabs} />
);

const AuditTablesOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 9, h: 9 }, TablesCards.mostQueried()],
      [{ x: 9, y: 0, w: 9, h: 9 }, TablesCards.leastQueried()],
    ]}
  />
);

const AuditTablesAllTab = () => (
  <AuditTableWithSearch
    placeholder={`Table name`}
    table={TablesCards.table()}
  />
);

AuditTables.tabs = [
  { path: "overview", title: "Overview", component: AuditTablesOverviewTab },
  { path: "all", title: "All tables", component: AuditTablesAllTab },
];

export default AuditTables;
