/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { CollectionDatasetOrDataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { getDatabasesList } from "metabase/query_builder/selectors";
import { isLocalField } from "metabase/lib/query/field_ref";

import { NotebookCell, NotebookCellItem } from "../NotebookCell";
import {
  FieldsPickerIcon,
  FieldPickerContentContainer,
  FIELDS_PICKER_STYLES,
} from "../FieldsPickerIcon";
import FieldsPicker from "./FieldsPicker";

function DataStep({ color, query, updateQuery }) {
  const question = query.question();
  const table = query.table();
  const canSelectTableColumns = table && query.isRaw();

  const hasCollectionDatasetsStep =
    question &&
    !question.isSaved() &&
    !question.databaseId() &&
    !question.tableId() &&
    question.collectionId() !== undefined;

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
              triggerElement={FieldsPickerIcon}
            />
          )
        }
        containerStyle={FIELDS_PICKER_STYLES.notebookItemContainer}
        rightContainerStyle={FIELDS_PICKER_STYLES.notebookRightItemContainer}
        data-testid="data-step-cell"
      >
        <CollectionDatasetOrDataSourceSelector
          hasTableSearch
          collectionId={question.collectionId()}
          hasCollectionDatasetsStep={hasCollectionDatasetsStep}
          databaseQuery={{ saved: true }}
          selectedDatabaseId={query.databaseId()}
          selectedTableId={query.tableId()}
          setSourceTableFn={tableId =>
            query.setTableId(tableId).setDefaultQuery().update(updateQuery)
          }
          isInitiallyOpen={!query.tableId()}
          triggerElement={
            <FieldPickerContentContainer>
              {table ? table.displayName() : t`Pick your starting data`}
            </FieldPickerContentContainer>
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
  const expressionDimensions = query.expressionDimensions();
  const selectedDimensions = query.columnDimensions();
  const selected = new Set(selectedDimensions.map(d => d.key()));
  const fields = query.fields();

  const handleSelectNone = () => {
    query
      .setFields([
        dimensions[0].mbql(),
        ...expressionDimensions.map(d => d.mbql()),
      ])
      .update(updateQuery);
  };

  const handleToggleDimension = dimension => {
    const newFields = [...dimensions, ...expressionDimensions]
      .filter(d => {
        if (d === dimension) {
          return !selected.has(d.key());
        } else {
          return selected.has(d.key());
        }
      })
      .map(d => d.mbql());

    query.setFields(newFields).update(updateQuery);
  };

  const hasOneColumnSelected = fields.filter(isLocalField).length === 1;

  return (
    <FieldsPicker
      {...props}
      dimensions={dimensions}
      selectedDimensions={selectedDimensions}
      isAll={!fields || fields.length === 0}
      onSelectAll={() => query.clearFields().update(updateQuery)}
      onSelectNone={handleSelectNone}
      disableSelected={hasOneColumnSelected}
      onToggleDimension={handleToggleDimension}
    />
  );
};
