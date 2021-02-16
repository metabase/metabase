import React from "react";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

export default function QuestionDataSelector({ query, triggerElement }) {
  return (
    <DatabaseSchemaAndTableDataSelector
      // Set this to false for now so we use our own trigger and component instead
      databaseQuery={{ saved: false }}
      selectedDatabaseId={query.databaseId()}
      selectedTableId={query.tableId()}
      setSourceTableFn={tableId =>
        query
          .setTableId(tableId)
          .setDefaultQuery()
          .update(null, { run: true })
      }
      triggerElement={triggerElement}
      isOpen
      onSwitchToSavedQuestions={() => alert("clicked saved q")}
    />
  );
}
