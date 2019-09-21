import React from "react";
import { connect } from "react-redux";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import { getDatabasesList } from "metabase/query_builder/selectors";

function QuestionDataSelector({ query, databases, triggerElement }) {
  return (
    <DatabaseSchemaAndTableDataSelector
      databases={databases}
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
    />
  );
}

export default connect(state => ({ databases: getDatabasesList(state) }))(
  QuestionDataSelector,
);
