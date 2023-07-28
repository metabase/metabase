/* eslint-disable react/prop-types */
import EntityName from "metabase/entities/containers/EntityName";
import AuditContent from "../components/AuditContent";
import AuditTable from "../containers/AuditTable";

import * as TableDetailCards from "../lib/cards/table_detail";

const AuditTableDetail = ({ params, ...props }) => {
  const tableId = parseInt(params.tableId);
  return (
    <AuditContent
      {...props}
      title={
        <EntityName
          entityType="tables"
          entityId={tableId}
          property="display_name"
        />
      }
      tabs={AuditTableDetail.tabs}
      tableId={tableId}
    />
  );
};

const AuditTableAuditLogTab = ({ tableId }) => (
  <AuditTable table={TableDetailCards.auditLog(tableId)} />
);

AuditTableDetail.tabs = [
  { path: "log", title: "Audit log", component: AuditTableAuditLogTab },
];

export default AuditTableDetail;
