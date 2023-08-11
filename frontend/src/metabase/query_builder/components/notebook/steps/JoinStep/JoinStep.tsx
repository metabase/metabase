import { useRef, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell, NotebookCellItem } from "../../NotebookCell";

import { useJoin } from "./use-join";
import { useJoinCondition } from "./use-join-condition";
import {
  JoinConditionColumnPicker,
  JoinConditionColumnPickerRef,
} from "./JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "./JoinConditionOperatorPicker";
import { JoinStrategyPicker } from "./JoinStrategyPicker";
import { JoinTablePicker } from "./JoinTablePicker";

import { ConditionNotebookCell } from "./JoinStep.styled";

export function JoinStep({
  topLevelQuery: query,
  step,
  color,
  readOnly,
  sourceQuestion,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex, itemIndex } = step;

  const joins = Lib.joins(query, stageIndex);
  const join = typeof itemIndex === "number" ? joins[itemIndex] : undefined;

  const {
    strategy,
    table,
    columns,
    conditions,
    setStrategy,
    setTable,
    addCondition,
    updateCondition,
    isColumnSelected,
    setSelectedColumns,
  } = useJoin(query, stageIndex, join);

  const [isAddingNewCondition, setIsAddingNewCondition] = useState(false);

  // Is only needed for `joinLHSDisplayName`
  // to properly display the LHS table name until the first condition is complete
  const [selectedLHSColumn, setSelectedLHSColumn] = useState<
    Lib.ColumnMetadata | undefined
  >();

  const lhsDisplayName = Lib.joinLHSDisplayName(
    query,
    stageIndex,
    join || table,
    selectedLHSColumn,
  );

  const isStartedFromModel = Boolean(sourceQuestion?.isDataset?.());

  const handleStrategyChange = (nextStrategy: Lib.JoinStrategy) => {
    setStrategy(nextStrategy);
    if (join) {
      const nextJoin = Lib.withJoinStrategy(join, nextStrategy);
      const nextQuery = Lib.replaceClause(query, stageIndex, join, nextJoin);
      updateQuery(nextQuery);
    }
  };

  const handleTableChange = (nextTable: Lib.Joinable) => {
    const nextQuery = setTable(nextTable);

    // If setTable returns a query,
    // it means it was possible to automatically set the condition via FKs
    if (nextQuery) {
      updateQuery(nextQuery);
    } else {
      setIsAddingNewCondition(true);
    }
  };

  const handleSelectedColumnsChange = (nextColumns: Lib.JoinFields) => {
    const nextQuery = setSelectedColumns(nextColumns);
    if (nextQuery) {
      updateQuery(nextQuery);
    }
  };

  const handleAddCondition = (condition: Lib.JoinConditionClause) => {
    const nextQuery = addCondition(condition);
    if (nextQuery) {
      updateQuery(nextQuery);
      setIsAddingNewCondition(false);
    }
  };

  const handleUpdateCondition = (
    conditionIndex: number,
    nextCondition: Lib.JoinConditionClause,
  ) => {
    const nextQuery = updateCondition(conditionIndex, nextCondition);
    if (nextQuery) {
      updateQuery(nextQuery);
    }
  };

  const renderJoinCondition = (
    condition?: Lib.JoinConditionClause,
    index?: number,
  ) => {
    if (!table) {
      return null;
    }

    const isEditing = condition && typeof index === "number";
    const key = isEditing ? `join-condition-${index}` : "new-join-condition";

    return (
      <JoinCondition
        key={key}
        query={query}
        stageIndex={stageIndex}
        condition={condition}
        join={join}
        table={table}
        color={color}
        readOnly={readOnly}
        onChange={nextCondition => {
          if (isEditing) {
            handleUpdateCondition(index, nextCondition);
          } else {
            handleAddCondition(nextCondition);
          }
        }}
        onChangeLHSColumn={setSelectedLHSColumn}
      />
    );
  };

  return (
    <Flex align="center" miw="100%" gap="1rem">
      <NotebookCell className="flex-full" color={color}>
        <Flex direction="row" gap={6}>
          <NotebookCellItem color={color} aria-label={t`Left table`}>
            {lhsDisplayName}
          </NotebookCellItem>
          <JoinStrategyPicker
            query={query}
            stageIndex={stageIndex}
            strategy={strategy}
            onChange={handleStrategyChange}
          />
          <JoinTablePicker
            query={query}
            stageIndex={stageIndex}
            table={table}
            columns={columns}
            color={color}
            isStartedFromModel={isStartedFromModel}
            readOnly={readOnly}
            isColumnSelected={isColumnSelected}
            onChangeTable={handleTableChange}
            onChangeFields={handleSelectedColumnsChange}
          />
        </Flex>
      </NotebookCell>
      {!!table && (
        <>
          <Box>
            <Text color="brand" weight="bold">{t`on`}</Text>
          </Box>
          <ConditionNotebookCell color={color}>
            {conditions.map(renderJoinCondition)}
            {isAddingNewCondition && renderJoinCondition()}
          </ConditionNotebookCell>
        </>
      )}
    </Flex>
  );
}

interface JoinConditionProps {
  query: Lib.Query;
  stageIndex: number;
  condition?: Lib.JoinConditionClause;
  join?: Lib.Join;
  table: Lib.Joinable;
  readOnly?: boolean;
  color: string;
  onChange: (condition: Lib.JoinConditionClause) => void;
  onChangeLHSColumn: (column: Lib.ColumnMetadata) => void;
}

function JoinCondition({
  query,
  stageIndex,
  condition,
  join,
  table,
  readOnly,
  color,
  onChange,
  onChangeLHSColumn,
}: JoinConditionProps) {
  const {
    lhsColumn,
    rhsColumn,
    operator,
    operators,
    lhsColumns,
    rhsColumns,
    setOperator,
    setLHSColumn,
    setRHSColumn,
  } = useJoinCondition(query, stageIndex, table, join, condition);

  const rhsColumnPicker = useRef<JoinConditionColumnPickerRef>(null);

  const lhsColumnGroup = Lib.groupColumns(lhsColumns);
  const rhsColumnGroup = Lib.groupColumns(rhsColumns);

  const handleOperatorChange = (operator: Lib.FilterOperator) => {
    const nextCondition = setOperator(operator);
    if (nextCondition) {
      onChange(nextCondition);
    }
  };

  const handleLHSColumnChange = (lhsColumn: Lib.ColumnMetadata) => {
    const nextCondition = setLHSColumn(lhsColumn);
    if (nextCondition) {
      onChange(nextCondition);
    } else if (!rhsColumn) {
      rhsColumnPicker.current?.open?.();
    }
    onChangeLHSColumn(lhsColumn);
  };

  const handleRHSColumnChange = (rhsColumn: Lib.ColumnMetadata) => {
    const nextCondition = setRHSColumn(rhsColumn);
    if (nextCondition) {
      onChange(nextCondition);
    }
  };

  return (
    <Flex gap="6px" align="center">
      <JoinConditionColumnPicker
        query={query}
        stageIndex={stageIndex}
        column={lhsColumn}
        columnGroups={lhsColumnGroup}
        label={t`Left column`}
        isInitiallyVisible={!condition}
        readOnly={readOnly}
        color={color}
        onSelect={handleLHSColumnChange}
      />
      <JoinConditionOperatorPicker
        query={query}
        stageIndex={stageIndex}
        operator={operator}
        operators={operators}
        onChange={handleOperatorChange}
      />
      <JoinConditionColumnPicker
        query={query}
        stageIndex={stageIndex}
        column={rhsColumn}
        columnGroups={rhsColumnGroup}
        label={t`Right column`}
        readOnly={readOnly}
        color={color}
        popoverRef={rhsColumnPicker}
        onSelect={handleRHSColumnChange}
      />
    </Flex>
  );
}
