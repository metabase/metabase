import React from "react";

import * as Queries from "../../audit_app/lib/cards/queries";
import AuditTable from "../../audit_app/containers/AuditTable";

const FailingQuestionsAuditTable = () => (
  <AuditTable table={Queries.bad_table()} />
);

export default FailingQuestionsAuditTable;
