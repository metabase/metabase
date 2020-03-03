import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { NotebookCell, NotebookCellItem } from "../NotebookCell";

import { getDatabasesList } from "metabase/query_builder/selectors";

function DataStep({ color, query, databases, updateQuery }) {
  const table = query.table();
  return (
    <NotebookCell color={color}>
      <DatabaseSchemaAndTableDataSelector
        databaseQuery={{ saved: true }}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={query.tableId()}
        setSourceTableFn={tableId =>
          query
            .setTableId(tableId)
            .setDefaultQuery()
            .update(updateQuery)
        }
        isInitiallyOpen={!query.tableId()}
        triggerElement={
          !query.tableId() ? (
            <NotebookCellItem color={color} inactive>
              {t`Pick your starting data`}
            </NotebookCellItem>
          ) : (
            <NotebookCellItem color={color} icon="table2">
              {table && table.displayName()}
            </NotebookCellItem>
          )
        }
      />
      {table && query.isRaw() && (
        <DataFieldsPicker
          className="ml-auto mb1 text-bold"
          query={query}
          updateQuery={updateQuery}
        />
      )}
    </NotebookCell>
  );
}

export default connect(state => ({ databases: getDatabasesList(state) }))(
  DataStep,
);

import FieldsPicker from "./FieldsPicker";

const DataFieldsPicker = ({ className, query, updateQuery }) => {
  const dimensions = query.tableDimensions();
  const selectedDimensions = query.columnDimensions();
  const selected = new Set(selectedDimensions.map(d => d.key()));
  const fields = query.fields();
  return (
    <FieldsPicker
      className={className}
      dimensions={dimensions}
      selectedDimensions={selectedDimensions}
      isAll={!fields || fields.length === 0}
      onSelectAll={() => query.clearFields().update(updateQuery)}
      onToggleDimension={(dimension, enable) => {
        query
          .setFields(
            dimensions
              .filter(d => {
                if (d === dimension) {
                  return !selected.has(d.key());
                } else {
                  return selected.has(d.key());
                }
              })
              .map(d => d.mbql()),
          )
          .update(updateQuery);
      }}
    />
  );
};
