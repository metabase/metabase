import React from "react";
import { t } from "ttag";
import * as AlertCards from "../lib/cards/alerts";
import AuditTableWithSearch from "./AuditTableWithSearch";

const AuditAlertTable = () => {
  return (
    <AuditTableWithSearch
      table={AlertCards.alerts()}
      placeholder={t`Filter by question name`}
    />
  );
};

export default AuditAlertTable;
