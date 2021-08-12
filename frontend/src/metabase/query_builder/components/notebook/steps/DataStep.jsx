/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { getDatabasesList } from "metabase/query_builder/selectors";

import { NotebookCell, NotebookCellItem } from "../NotebookCell";
import { FieldsPickerIcon, FIELDS_PICKER_STYLES } from "../FieldsPickerIcon";
import FieldsPicker from "./FieldsPicker";

function DataStep({ color, query, updateQuery }) {
  const table = query.table();
  const canSelectTableColumns = table && query.isRaw();
  return (
    <NotebookCell color={color}>
      <NotebookCellItem
        color={color}
        inactive={!table}
        right={
          canSelectTableColumns && (
            <DataFieldsPicker
              query={query}
              updateQuery={updateQuery}
              triggerStyle={FIELDS_PICKER_STYLES.trigger}
              triggerElement={<FieldsPickerIcon />}
            />
          )
        }
        rightContainerStyle={FIELDS_PICKER_STYLES.notebookItemContainer}
        data-testid="data-step-cell"
      >
        <DatabaseSchemaAndTableDataSelector
          hasTableSearch
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
            table ? table.displayName() : t`Pick your starting data`
          }
        />
      </NotebookCellItem>
    </NotebookCell>
  );
}

export default connect(state => ({ databases: getDatabasesList(state) }))(
  DataStep,
);

const DataFieldsPicker = ({ query, updateQuery, ...props }) => {
  const dimensions = query.tableDimensions();
  const selectedDimensions = query.columnDimensions();
  const selected = new Set(selectedDimensions.map(d => d.key()));
  const fields = query.fields();
  return (
    <FieldsPicker
      {...props}
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
