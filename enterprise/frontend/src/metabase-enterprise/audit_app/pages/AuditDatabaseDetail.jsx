/* eslint-disable react/prop-types */
import EntityName from "metabase/entities/containers/EntityName";
import AuditContent from "../components/AuditContent";
import AuditTable from "../containers/AuditTable";

import * as DatabaseDetailCards from "../lib/cards/database_detail";

const AuditDatabaseDetail = ({ params, ...props }) => {
  const databaseId = parseInt(params.databaseId);
  return (
    <AuditContent
      {...props}
      title={
        <EntityName
          entityType="databases"
          entityId={databaseId}
          property="name"
        />
      }
      tabs={AuditDatabaseDetail.tabs}
      databaseId={databaseId}
    />
  );
};

const AuditDatabaseAuditLogTab = ({ databaseId }) => (
  <AuditTable table={DatabaseDetailCards.auditLog(databaseId)} />
);

AuditDatabaseDetail.tabs = [
  { path: "log", title: "Audit log", component: AuditDatabaseAuditLogTab },
];

export default AuditDatabaseDetail;
