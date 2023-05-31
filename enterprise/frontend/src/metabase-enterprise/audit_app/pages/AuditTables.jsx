/* eslint-disable react/prop-types */
import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as TablesCards from "../lib/cards/tables";

const AuditTables = props => (
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
    placeholder={t`Table name`}
    table={TablesCards.table()}
  />
);

AuditTables.tabs = [
  { path: "overview", title: t`Overview`, component: AuditTablesOverviewTab },
  { path: "all", title: t`All tables`, component: AuditTablesAllTab },
];

export default AuditTables;
