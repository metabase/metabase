import React, { useState } from "react";
import { t } from "ttag";

import AuditTable from "./AuditTable";
import AuditParameters from "../components/AuditParameters";

import { table } from "../lib/cards/queries";

const getSortOrder = isAscending => (isAscending ? "asc" : "desc");

export function QuestionsAuditTable(props) {
  const [sorting, setSorting] = useState({
    column: "query_runs",
    isAscending: false,
  });

  const handleSortingChange = sorting => setSorting(sorting);

  return (
    <AuditParameters
      parameters={[
        { key: "questionFilter", placeholder: t`Question name` },
        { key: "collectionFilter", placeholder: t`Collection name` },
      ]}
    >
      {({ questionFilter, collectionFilter }) => (
        <AuditTable
          {...props}
          pageSize={50}
          isSortable
          sorting={sorting}
          onSortingChange={handleSortingChange}
          table={table(
            questionFilter,
            collectionFilter,
            sorting.column,
            getSortOrder(sorting.isAscending),
          )}
        />
      )}
    </AuditParameters>
  );
}
