import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { getDatabasesList } from "metabase/query_builder/selectors";

import type { TableId } from "metabase-types/api";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Dimension from "metabase-lib/Dimension";
import { isLocalField } from "metabase-lib/queries/utils/field-ref";

import type { NotebookStepUiComponentProps } from "../types";
import { NotebookCell, NotebookCellItem } from "../NotebookCell";
import {
  FieldsPickerIcon,
  FieldPickerContentContainer,
  FIELDS_PICKER_STYLES,
} from "../FieldsPickerIcon";
import FieldsPicker from "./FieldsPicker";

function DataStep({
  color,
  query,
  updateQuery,
  readOnly,
}: NotebookStepUiComponentProps) {
  const question = query.question();
  const table = query.table();
  const canSelectTableColumns = table && query.isRaw() && !readOnly;

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
        <DataSourceSelector
          hasTableSearch
          collectionId={question.collectionId()}
          databaseQuery={{ saved: true }}
          selectedDatabaseId={query.databaseId()}
          selectedTableId={query.tableId()}
          setSourceTableFn={(tableId: TableId) =>
            updateQuery(query.setTableId(tableId).setDefaultQuery())
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(state => ({ databases: getDatabasesList(state) }))(
  DataStep,
);

interface DataFieldsPickerProps {
  query: StructuredQuery;
  updateQuery: NotebookStepUiComponentProps["updateQuery"];
  triggerStyle?: React.CSSProperties;
  triggerElement: React.ComponentType<{ isTriggeredComponentOpen?: boolean }>;
}

const DataFieldsPicker = ({
  query,
  updateQuery,
  ...props
}: DataFieldsPickerProps) => {
  const dimensions = query.tableDimensions();
  const expressionDimensions = query.expressionDimensions();
  const selectedDimensions = query.columnDimensions();
  const selected = new Set(selectedDimensions.map(d => d.key()));
  const fields = query.fields();

  const handleSelectNone = () => {
    updateQuery(
      query.setFields([
        dimensions[0].mbql(),
        ...expressionDimensions.map(d => d.mbql()),
      ]),
    );
  };

  const handleToggleDimension = (dimension: Dimension) => {
    const newFields = [...dimensions, ...expressionDimensions]
      .filter(d => {
        if (d === dimension) {
          return !selected.has(d.key());
        } else {
          return selected.has(d.key());
        }
      })
      .map(d => d.mbql());

    updateQuery(query.setFields(newFields));
  };

  const hasOneColumnSelected = fields.filter(isLocalField).length === 1;

  return (
    <FieldsPicker
      {...props}
      dimensions={dimensions}
      selectedDimensions={selectedDimensions}
      isAll={!fields || fields.length === 0}
      onSelectAll={() => updateQuery(query.clearFields())}
      onSelectNone={handleSelectNone}
      disableSelected={hasOneColumnSelected}
      onToggleDimension={handleToggleDimension}
    />
  );
};
