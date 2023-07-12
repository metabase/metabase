import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { Box, Flex, Text } from "metabase/ui";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell, NotebookCellItem } from "../../NotebookCell";

import { JoinConditionColumnPicker } from "./JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "./JoinConditionOperatorPicker";
import { JoinStrategyPicker } from "./JoinStrategyPicker";
import { JoinTablePicker } from "./JoinTablePicker";

import { ConditionNotebookCell } from "./JoinStep.styled";

function getDefaultJoinStrategy(query: Lib.Query, stageIndex: number) {
  const strategies = Lib.availableJoinStrategies(query, stageIndex);
  const defaultStrategy = strategies.find(
    strategy => Lib.displayInfo(query, stageIndex, strategy).default,
  );
  return defaultStrategy || strategies[0];
}

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
  const previousJoin = usePrevious(join);

  const [strategy, _setStrategy] = useState<Lib.JoinStrategy>(
    join ? Lib.joinStrategy(join) : getDefaultJoinStrategy(query, stageIndex),
  );
  const [table, _setTable] = useState(
    join ? Lib.joinedThing(query, join) : undefined,
  );
  const [conditions, _setConditions] = useState<Lib.JoinConditionClause[]>(
    join ? Lib.joinConditions(join) : [],
  );

  useEffect(() => {
    if (join && previousJoin !== join) {
      _setStrategy(Lib.joinStrategy(join));
      _setTable(Lib.joinedThing(query, join));
      _setConditions(Lib.joinConditions(join));
    }
  }, [query, join, previousJoin]);

  const submitJoinIfValid = ({
    nextTable = table,
    nextStrategy = strategy,
    nextConditions = conditions,
  }: {
    nextTable?: Lib.Joinable;
    nextStrategy?: Lib.JoinStrategy;
    nextConditions?: Lib.JoinConditionClause[];
  }) => {
    const hasConditions = nextConditions.length > 0;
    if (nextTable && nextStrategy && hasConditions) {
      let nextJoin = Lib.joinClause(nextTable, nextConditions);
      nextJoin = Lib.withJoinFields(nextJoin, "all");
      nextJoin = Lib.withJoinStrategy(nextJoin, nextStrategy);
      const nextQuery = join
        ? Lib.replaceClause(query, stageIndex, join, nextJoin)
        : Lib.join(query, stageIndex, nextJoin);
      updateQuery(nextQuery);
    }
  };

  const setStrategy = (nextStrategy: Lib.JoinStrategy) => {
    _setStrategy(nextStrategy);
    if (join) {
      const nextJoin = Lib.withJoinStrategy(join, nextStrategy);
      const nextQuery = Lib.replaceClause(query, stageIndex, join, nextJoin);
      updateQuery(nextQuery);
    }
  };

  const setTable = (nextTable: Lib.Joinable) => {
    _setTable(nextTable);
  };

  const handleAddCondition = (condition: Lib.JoinConditionClause) => {
    const nextConditions = [...conditions, condition];
    _setConditions([...nextConditions, condition]);
    submitJoinIfValid({
      nextConditions: [...nextConditions, condition],
    });
  };

  const handleUpdateCondition = (
    conditionIndex: number,
    nextCondition: Lib.JoinConditionClause,
  ) => {
    const currentCondition = conditions[conditionIndex];
    const nextQuery = Lib.replaceClause(
      query,
      stageIndex,
      currentCondition,
      nextCondition,
    );
    updateQuery(nextQuery);
    const nextConditions = [...conditions];
    nextConditions[conditionIndex] = nextCondition;
    _setConditions(nextConditions);
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
            onChange={setStrategy}
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

  const [lhsColumn, _setLHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    externalOp?.args[0],
  );
  const [rhsColumn, _setRHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    externalOp?.args[1],
  );
  const [operator, _setOperator] = useState<Lib.FilterOperator | undefined>(
    getInitialConditionOperator(query, stageIndex, condition),
  );

  const submitConditionIfValid = ({
    nextLHSColumn = lhsColumn,
    nextRHSColumn = rhsColumn,
    nextOperator = operator,
  }: {
    nextLHSColumn?: Lib.ColumnMetadata;
    nextRHSColumn?: Lib.ColumnMetadata;
    nextOperator?: Lib.FilterOperator;
  } = {}) => {
    if (nextLHSColumn && nextRHSColumn && nextOperator) {
      onChange(
        Lib.joinConditionClause(nextOperator, nextLHSColumn, nextRHSColumn),
      );
    }
  };

  const setLHSColumn = (lhsColumn?: Lib.ColumnMetadata) => {
    _setLHSColumn(lhsColumn);
    submitConditionIfValid({ nextLHSColumn: lhsColumn });
  };

  const setRHSColumn = (rhsColumn?: Lib.ColumnMetadata) => {
    _setRHSColumn(rhsColumn);
    submitConditionIfValid({ nextRHSColumn: rhsColumn });
  };

  const setOperator = (operator?: Lib.FilterOperator) => {
    _setOperator(operator);
    submitConditionIfValid({ nextOperator: operator });
  };

  const lhsColumnGroup = Lib.groupColumns(lhsColumns);
  const rhsColumnGroup = Lib.groupColumns(rhsColumns);

  const handleRemoveLHSColumn = () => setLHSColumn(undefined);
  const handleRemoveRHSColumn = () => setRHSColumn(undefined);

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
        onSelect={setLHSColumn}
        onRemove={handleRemoveLHSColumn}
      />
      <JoinConditionOperatorPicker
        query={query}
        stageIndex={stageIndex}
        operator={operator}
        operators={operators}
        onChange={setOperator}
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
        onSelect={setRHSColumn}
        onRemove={handleRemoveRHSColumn}
      />
    </Flex>
  );
}
