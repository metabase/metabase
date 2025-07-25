import { useLayoutEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnPickerSidePanel } from "../../ColumnPickerSidePanel";
import type { FieldPickerItem } from "../../FieldPicker";
import { NotebookCell, NotebookCellItem } from "../../NotebookCell";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import S from "./JoinDraft.module.css";
import { getDefaultJoinStrategy, getJoinFields } from "./utils";

interface JoinDraftProps {
  query: Lib.Query;
  stageIndex: number;
  color: string;
  initialStrategy?: Lib.JoinStrategy;
  initialRhsTable?: Lib.Joinable;
  isReadOnly: boolean;
  onJoinChange: (join: Lib.Join) => void;
}

export function JoinDraft({
  query,
  stageIndex,
  color,
  initialStrategy,
  initialRhsTable,
  isReadOnly,
  onJoinChange,
}: JoinDraftProps) {
  const sourceTableId = Lib.sourceTableOrCardId(query);
  const [strategy, setStrategy] = useState(
    () => initialStrategy ?? getDefaultJoinStrategy(query, stageIndex),
  );
  const [rhsTable, setRhsTable] = useState(initialRhsTable);
  const [rhsTableColumns, setRhsTableColumns] = useState(() =>
    initialRhsTable
      ? Lib.joinableColumns(query, stageIndex, initialRhsTable)
      : [],
  );
  const [selectedRhsTableColumns, setSelectedRhsTableColumns] =
    useState(rhsTableColumns);
  const [lhsExpression, setLhsExpression] = useState<Lib.ExpressionClause>();
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

  const lhsTableName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, rhsTable, lhsExpression),
    [query, stageIndex, rhsTable, lhsExpression],
  );

  const rhsTableName = useMemo(
    () =>
      rhsTable
        ? Lib.displayInfo(query, stageIndex, rhsTable).displayName
        : undefined,
    [query, stageIndex, rhsTable],
  );

  const handleTableChange = (newTable: Lib.Joinable) => {
    const newConditions = Lib.suggestedJoinConditions(
      query,
      stageIndex,
      newTable,
    );
    if (newConditions.length > 0) {
      const newJoin = Lib.joinClause(newTable, newConditions, strategy);
      onJoinChange(newJoin);
    } else {
      const newColumns = Lib.joinableColumns(query, stageIndex, newTable);
      setRhsTable(newTable);
      setRhsTableColumns(newColumns);
      setSelectedRhsTableColumns(newColumns);
    }
  };

  const handleConditionChange = (newCondition: Lib.JoinCondition) => {
    if (rhsTable) {
      const newJoin = Lib.withJoinFields(
        Lib.joinClause(rhsTable, [newCondition], strategy),
        getJoinFields(rhsTableColumns, selectedRhsTableColumns),
      );
      onJoinChange(newJoin);
    }
  };

  const handleReset = () => {
    const rhsTableColumns = initialRhsTable
      ? Lib.joinableColumns(query, stageIndex, initialRhsTable)
      : [];
    setStrategy(initialStrategy ?? getDefaultJoinStrategy(query, stageIndex));
    setRhsTable(initialRhsTable);
    setRhsTableColumns(rhsTableColumns);
    setSelectedRhsTableColumns(rhsTableColumns);
    setLhsExpression(undefined);
  };

  const handleResetRef = useLatest(handleReset);
  useLayoutEffect(
    () => handleResetRef.current(),
    [sourceTableId, handleResetRef],
  );

  const isColumnSelected = ({ column }: FieldPickerItem) => {
    return selectedRhsTableColumns.includes(column);
  };

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const newSelectedColumns = [...selectedRhsTableColumns];
    if (isSelected) {
      newSelectedColumns.push(column);
    } else {
      const columnIndex = selectedRhsTableColumns.indexOf(column);
      newSelectedColumns.splice(columnIndex, 1);
    }
    setSelectedRhsTableColumns(newSelectedColumns);
  };

  const handleSelectAll = () => {
    setSelectedRhsTableColumns(rhsTableColumns);
  };

  const handleSelectNone = () => {
    setSelectedRhsTableColumns([]);
  };

  const handleReorderColumns = (reorderedColumns: Lib.ColumnMetadata[]) => {
    // Update the order of rhsTableColumns to match the reordered columns
    const newRhsTableColumns = reorderedColumns.slice();
    setRhsTableColumns(newRhsTableColumns);
    
    // Also update selected columns to maintain the same selection state
    const selectedColumns = reorderedColumns.filter(column => 
      selectedRhsTableColumns.includes(column)
    );
    setSelectedRhsTableColumns(selectedColumns);
  };

  return (
    <>
      <Flex miw="100%" gap="1rem">
        <NotebookCell className={S.JoinCell} color={color}>
          <Flex direction="row" gap={6}>
            <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
              {lhsTableName}
            </NotebookCellItem>
            <JoinStrategyPicker
              query={query}
              stageIndex={stageIndex}
              strategy={strategy}
              isReadOnly={isReadOnly}
              onChange={setStrategy}
            />
            <JoinTablePicker
              query={query}
              stageIndex={stageIndex}
              table={rhsTable}
              color={color}
              isReadOnly={isReadOnly}
              onOpenColumnPicker={() => setIsColumnPickerOpen(true)}
              onChange={handleTableChange}
            />
          </Flex>
        </NotebookCell>
        {rhsTable && (
          <Box>
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              joinable={rhsTable}
              strategy={strategy}
              lhsTableName={lhsTableName}
              rhsTable={rhsTable}
              rhsTableName={rhsTableName}
              isReadOnly={isReadOnly}
              isRemovable={false}
              onChange={handleConditionChange}
              onRemove={() => {}}
              onLhsExpressionChange={setLhsExpression}
            />
          </Box>
        )}
      </Flex>

      {rhsTable && (
        <ColumnPickerSidePanel
          isOpen={isColumnPickerOpen}
          onClose={() => setIsColumnPickerOpen(false)}
          query={query}
          stageIndex={stageIndex}
          columns={rhsTableColumns}
          title={t`Pick columns`}
          isColumnSelected={isColumnSelected}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          onReorderColumns={handleReorderColumns}
          data-testid="join-draft-column-picker"
        />
      )}
    </>
  );
}
