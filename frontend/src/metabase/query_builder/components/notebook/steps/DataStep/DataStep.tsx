import { useMemo } from "react";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { FieldPicker } from "metabase/common/components/FieldPicker";
import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";

import type { TableId } from "metabase-types/api";
import * as Lib from "metabase-lib";
import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell, NotebookCellItem } from "../../NotebookCell";
import {
  FieldPickerContentContainer,
  FieldsPickerIcon,
  FIELDS_PICKER_STYLES,
} from "../../FieldsPickerIcon";

export const DataStep = ({
  topLevelQuery,
  query,
  step,
  color,
  updateQuery,
  readOnly,
}: NotebookStepUiComponentProps) => {
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
              query={topLevelQuery}
              stageIndex={step.stageIndex}
              updateQuery={updateQuery}
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
            updateQuery(query.setTableId(tableId))
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
};

interface DataFieldsPickerProps {
  query: Lib.Query;
  stageIndex: number;
  updateQuery: (query: Lib.Query) => Promise<void>;
}

export const DataFieldsPicker = ({
  query,
  stageIndex,
  updateQuery,
}: DataFieldsPickerProps) => {
  const columns = useMemo(
    () => Lib.fieldableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const handleToggle = (changedIndex: number, isSelected: boolean) => {
    const nextColumns = columns.filter((_, currentIndex) => {
      if (currentIndex === changedIndex) {
        return isSelected;
      }
      const column = columns[currentIndex];
      return Lib.displayInfo(query, stageIndex, column).selected;
    });
    const nextQuery = Lib.withFields(query, stageIndex, nextColumns);
    updateQuery(nextQuery);
  };

  const checkColumnSelected = (column: Lib.ColumnMetadata) =>
    !!Lib.displayInfo(query, stageIndex, column).selected;

  const handleSelectAll = () => {
    const nextQuery = Lib.withFields(query, stageIndex, []);
    updateQuery(nextQuery);
  };

  const handleSelectNone = () => {
    const nextQuery = Lib.withFields(query, stageIndex, [columns[0]]);
    updateQuery(nextQuery);
  };

  return (
    <PopoverWithTrigger
      triggerStyle={FIELDS_PICKER_STYLES.trigger}
      triggerElement={FieldsPickerIcon}
    >
      <FieldPicker
        query={query}
        stageIndex={stageIndex}
        columns={columns}
        isColumnSelected={checkColumnSelected}
        onToggle={handleToggle}
        onSelectAll={handleSelectAll}
        onSelectNone={handleSelectNone}
      />
    </PopoverWithTrigger>
  );
};
