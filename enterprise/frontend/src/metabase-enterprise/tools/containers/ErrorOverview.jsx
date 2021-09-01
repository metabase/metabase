import React, { useState } from "react";
import { t } from "ttag";

import * as Queries from "../../audit_app/lib/cards/queries";
import AuditTable from "../../audit_app/containers/AuditTable";
import AuditParameters from "../../audit_app/components/AuditParameters";

const getSortOrder = isAscending => (isAscending ? "asc" : "desc");

export default function ErrorOverview(props) {
  const [sorting, setSorting] = useState({
    column: "card_name",
    isAscending: true,
  });

  const [rowChecked, setRowChecked] = useState({})
  const handleRowSelectClick = e => {
    const newRowChecked = rowChecked;
    newRowChecked[e.originRow] = !(rowChecked[e.originRow] || false);
    setRowChecked(newRowChecked);
  };

  const handleSortingChange = sorting => setSorting(sorting);
  return (
    <AuditParameters
      parameters={[
        { key: "errorFilter", placeholder: t`Error name` },
        { key: "dbFilter", placeholder: t`DB name` },
        { key: "collectionFilter", placeholder: t`Collection name` },
      ]}
      buttons={[
        { key: "reloadSelected", label: t`Reload Selected`, onClick: () => {} }
      ]}
    >
      {({ errorFilter, dbFilter, collectionFilter }) => (
        <AuditTable
          {...props}
          pageSize={50}
          isSortable
          isSelectable
          selectHeader={"Reload?"}
          rowChecked={rowChecked}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          onRowSelectClick={handleRowSelectClick}
          table={Queries.bad_table(
            errorFilter,
            dbFilter,
            collectionFilter,
            sorting.column,
            getSortOrder(sorting.isAscending),
          )}
        />
      )}
    </AuditParameters>
  );
}
