import React from "react";

import { moderationIssuesTable } from "metabase-enterprise/audit_app/lib/cards/moderation";
import AuditContent from "../components/AuditContent";
import AuditTable from "../containers/AuditTable";

function AuditModerationIssuesOverview(props) {
  return (
    <AuditContent {...props} title="Moderation Issues">
      <AuditTable table={moderationIssuesTable()} />
    </AuditContent>
  );
}

export default AuditModerationIssuesOverview;
