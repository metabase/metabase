import React from "react";

import { t } from "ttag";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { NotebookCell, NotebookCellItem } from "../NotebookCell";

export default function DataStep({ color, query, updateQuery }) {
  return (
    <NotebookCell color={color}>
      <DatabaseSchemaAndTableDataSelector
        databases={query.metadata().databasesList()}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={query.tableId()}
        setSourceTableFn={tableId =>
          query.setTableId(tableId).update(updateQuery)
        }
        isInitiallyOpen={!query.tableId()}
        triggerElement={
          !query.tableId() ? (
            <NotebookCellItem color={color} inactive>
              {t`Pick your starting data`}
            </NotebookCellItem>
          ) : (
            <NotebookCellItem color={color} icon="table2">
              {query.table().displayName()}
            </NotebookCellItem>
          )
        }
      />
    </NotebookCell>
  );
}
