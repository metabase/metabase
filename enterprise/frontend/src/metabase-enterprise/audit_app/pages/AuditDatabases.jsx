/* eslint-disable react/prop-types */
import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as DatabasesCards from "../lib/cards/databases";

const AuditDatabases = props => (
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
    placeholder={t`Database name`}
    table={DatabasesCards.table()}
  />
);

AuditDatabases.tabs = [
  {
    path: "overview",
    title: t`Overview`,
    component: AuditDatabasesOverviewTab,
  },
  { path: "all", title: t`All databases`, component: AuditDatabasesAllTab },
];

export default AuditDatabases;
