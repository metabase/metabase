import React from "react";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

export default function QuestionDataSelector({ query, triggerElement }) {
  return (
    <DatabaseSchemaAndTableDataSelector
      databases={query.metadata().databasesList()}
      selectedDatabaseId={query.databaseId()}
      selectedTableId={query.tableId()}
      setSourceTableFn={tableId =>
        query.setTableId(tableId).update(null, { run: true })
      }
      triggerElement={triggerElement}
      isOpen
    />
  );
}
