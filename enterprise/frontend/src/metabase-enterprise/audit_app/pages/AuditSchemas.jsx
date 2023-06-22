import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as SchemasCards from "../lib/cards/schemas";

const AuditSchemas = props => (
  <AuditContent {...props} title="Schemas" tabs={AuditSchemas.tabs} />
);

const AuditSchemasOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 9, h: 9 }, SchemasCards.mostQueried()],
      [{ x: 9, y: 0, w: 9, h: 9 }, SchemasCards.slowestSchemas()],
    ]}
  />
);

const AuditSchemasAllTab = () => (
  <AuditTableWithSearch
    placeholder={t`Schema name`}
    table={SchemasCards.table()}
  />
);

AuditSchemas.tabs = [
  { path: "overview", title: t`Overview`, component: AuditSchemasOverviewTab },
  { path: "all", title: t`All schemas`, component: AuditSchemasAllTab },
];

export default AuditSchemas;
