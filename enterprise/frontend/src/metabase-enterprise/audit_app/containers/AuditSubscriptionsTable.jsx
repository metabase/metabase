import React from "react";
import { t } from "ttag";
import { subscriptions } from "../lib/cards/subscriptions";
import AuditTableWithSearch from "./AuditTableWithSearch";

const AuditSubscriptionsTable = () => {
  return (
    <AuditTableWithSearch
      table={subscriptions()}
      placeholder={t`Filter by dashboard name`}
    />
  );
};

export default AuditSubscriptionsTable;
