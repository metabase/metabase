import React from "react";

import * as Queries from "../../audit_app/lib/cards/queries";
import AuditDashboard from "../../audit_app/containers/AuditDashboard";

const FailingQuestionsAuditTable = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 16, h: 16 }, Queries.bad_table()],
    ]}
  />
);

export default FailingQuestionsAuditTable;
