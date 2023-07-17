import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box, Flex, Text } from "metabase/ui";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell, NotebookCellItem } from "../../NotebookCell";

import { useJoin } from "./use-join";
import { JoinConditionColumnPicker } from "./JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "./JoinConditionOperatorPicker";
import { JoinStrategyPicker } from "./JoinStrategyPicker";
import { JoinTablePicker } from "./JoinTablePicker";

import { ConditionNotebookCell } from "./JoinStep.styled";

function getConditionOperator(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinConditionClause,
) {
  const operators = Lib.joinConditionOperators(query, stageIndex);
  const { operator } = Lib.externalOp(condition);
  return operators.find(
    op => Lib.displayInfo(query, stageIndex, op).shortName === operator,
  );
}

function getDefaultJoinOperator(
  query: Lib.Query,
  stageIndex: number,
  lhsColumn: Lib.ColumnMetadata | undefined,
  rhsColumn: Lib.ColumnMetadata | undefined,
) {
  const operators = Lib.joinConditionOperators(
    query,
    stageIndex,
    lhsColumn,
    rhsColumn,
  );
  const defaultOperator = operators.find(
    operator => Lib.displayInfo(query, stageIndex, operator).default,
  );
  return defaultOperator || operators[0];
}

function getInitialConditionOperator(
  query: Lib.Query,
  stageIndex: number,
  condition?: Lib.JoinConditionClause,
) {
  if (condition) {
    const externalOp = Lib.externalOp(condition);
    const [lhsColumn, rhsColumn] = externalOp.args;
    return (
      getConditionOperator(query, stageIndex, condition) ||
      getDefaultJoinOperator(query, stageIndex, lhsColumn, rhsColumn)
    );
  } else {
    return getDefaultJoinOperator(query, stageIndex, undefined, undefined);
  }
}

export function JoinStep({
  topLevelQuery: query,
  step,
  color,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex, itemIndex } = step;

  const joins = Lib.joins(query, stageIndex);
  const join = typeof itemIndex === "number" ? joins[itemIndex] : undefined;

  const {
    strategy,
    table,
    conditions,
    setStrategy,
    setTable,
    addCondition,
    updateCondition,
  } = useJoin(query, stageIndex, join);

  const handleStrategyChange = (nextStrategy: Lib.JoinStrategy) => {
    setStrategy(nextStrategy);
    if (join) {
      const nextJoin = Lib.withJoinStrategy(join, nextStrategy);
      const nextQuery = Lib.replaceClause(query, stageIndex, join, nextJoin);
      updateQuery(nextQuery);
    }
  };

  const handleAddCondition = (condition: Lib.JoinConditionClause) => {
    const nextQuery = addCondition(condition);
    if (nextQuery) {
      updateQuery(nextQuery);
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

  // [undefined] is a special case to render a single empty condition for new joins
  const displayConditions = conditions.length > 0 ? conditions : [undefined];

  return (
    <Flex align="center" miw="100%" gap="1rem">
      <NotebookCell className="flex-full" color={color}>
        <Flex direction="row" gap={6}>
          <NotebookCellItem color={color} aria-label={t`Left table`}>
            Orders
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
            color={color}
            readOnly={readOnly}
            onChangeTable={setTable}
            onChangeFields={_.noop}
          />
        </Flex>
      </NotebookCell>
      {!!table && (
        <>
          <Box>
            <Text color="brand" weight="bold">{t`on`}</Text>
          </Box>
          <ConditionNotebookCell color={color}>
            {displayConditions.map((condition, index) => (
              <JoinCondition
                key={`join-condition-${index}`}
                query={query}
                stageIndex={stageIndex}
                condition={condition}
                table={table}
                color={color}
                readOnly={readOnly}
                onChange={nextCondition => {
                  if (condition) {
                    handleUpdateCondition(index, nextCondition);
                  } else {
                    handleAddCondition(nextCondition);
                  }
                }}
              />
            ))}
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
  table: Lib.Joinable;
  readOnly?: boolean;
  color: string;
  onChange: (condition: Lib.JoinConditionClause) => void;
}

function JoinCondition({
  query,
  stageIndex,
  condition,
  table,
  readOnly,
  color,
  onChange,
}: JoinConditionProps) {
  const operators = Lib.joinConditionOperators(query, stageIndex);
  const lhsColumns = Lib.joinConditionLHSColumns(query, stageIndex);
  const rhsColumns = Lib.joinConditionRHSColumns(query, stageIndex, table);

  const externalOp = condition ? Lib.externalOp(condition) : undefined;
  const [initialLHSColumn, initialRHSColumn] = externalOp?.args || [];

  const [lhsColumn, setLHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    initialLHSColumn,
  );
  const [rhsColumn, setRHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    initialRHSColumn,
  );
  const [operator, setOperator] = useState<Lib.FilterOperator | undefined>(
    getInitialConditionOperator(query, stageIndex, condition),
  );

  const submitConditionIfValid = ({
    nextOperator = operator,
    nextLHSColumn = lhsColumn,
    nextRHSColumn = rhsColumn,
  }: {
    nextOperator?: Lib.FilterOperator;
    nextLHSColumn?: Lib.ColumnMetadata;
    nextRHSColumn?: Lib.ColumnMetadata;
  } = {}) => {
    if (nextOperator && nextLHSColumn && nextRHSColumn) {
      const condition = Lib.joinConditionClause(
        nextOperator,
        nextLHSColumn,
        nextRHSColumn,
      );
      onChange(condition);
    }
  };

  const handleLHSColumnChange = (lhsColumn?: Lib.ColumnMetadata) => {
    setLHSColumn(lhsColumn);
    submitConditionIfValid({ nextLHSColumn: lhsColumn });
  };

  const handleRHSColumnChange = (rhsColumn?: Lib.ColumnMetadata) => {
    setRHSColumn(rhsColumn);
    submitConditionIfValid({ nextRHSColumn: rhsColumn });
  };

  const handleOperatorChange = (operator?: Lib.FilterOperator) => {
    setOperator(operator);
    submitConditionIfValid({ nextOperator: operator });
  };

  const handleLHSColumnRemove = () => handleLHSColumnChange(undefined);
  const handleRHSColumnRemove = () => handleRHSColumnChange(undefined);

  const lhsColumnGroup = Lib.groupColumns(lhsColumns);
  const rhsColumnGroup = Lib.groupColumns(rhsColumns);

  return (
    <Flex gap="6px" align="center">
      <JoinConditionColumnPicker
        query={query}
        stageIndex={stageIndex}
        column={lhsColumn}
        columnGroups={lhsColumnGroup}
        checkIsColumnSelected={col => false}
        label={t`Left column`}
        readOnly={readOnly}
        color={color}
        onSelect={handleLHSColumnChange}
        onRemove={handleLHSColumnRemove}
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
        checkIsColumnSelected={col => false}
        label={t`Right column`}
        readOnly={readOnly}
        color={color}
        onSelect={handleRHSColumnChange}
        onRemove={handleRHSColumnRemove}
      />
    </Flex>
  );
}
