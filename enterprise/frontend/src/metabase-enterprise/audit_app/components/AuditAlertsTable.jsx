import React from "react";
import { t } from "ttag";
import { alerts } from "../lib/cards/alerts";
import AuditTableWithSearch from "../containers/AuditTableWithSearch";

const AuditAlertsTable = () => {
  return (
    <AuditTableWithSearch
      table={alerts()}
      placeholder={t`Filter by question name`}
    />
  );
};

export default AuditAlertsTable;
