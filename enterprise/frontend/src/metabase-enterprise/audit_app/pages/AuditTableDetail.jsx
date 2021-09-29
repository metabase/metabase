/* eslint-disable react/prop-types */
import React from "react";

import AuditContent from "../components/AuditContent";
import AuditTable from "../containers/AuditTable";

import EntityName from "metabase/entities/containers/EntityName";

import * as TableDetailCards from "../lib/cards/table_detail";

type Props = {
  params: { [key: string]: string },
};

const AuditTableDetail = ({ params, ...props }: Props) => {
  const tableId = parseInt(params.tableId);
  return (
    <AuditContent
      {...props}
      title={
        <EntityName
          entityType="tables"
          entityId={tableId}
          property={"display_name"}
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
