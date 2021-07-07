/* eslint-disable react/prop-types */
import React from "react";

import AuditContent from "../components/AuditContent";
import AuditTable from "../containers/AuditTable";

import EntityName from "metabase/entities/containers/EntityName";

import * as DatabaseDetailCards from "../lib/cards/database_detail";

type Props = {
  params: { [key: string]: string },
};

const AuditDatabaseDetail = ({ params, ...props }: Props) => {
  const databaseId = parseInt(params.databaseId);
  return (
    <AuditContent
      {...props}
      title={
        <EntityName
          entityType="databases"
          entityId={databaseId}
          property={"name"}
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
