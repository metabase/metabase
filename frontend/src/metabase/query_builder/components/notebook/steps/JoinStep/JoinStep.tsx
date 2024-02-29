import { useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellAdd, NotebookCellItem } from "../../NotebookCell";
import type { NotebookStepUiComponentProps } from "../../types";

import { JoinConditionColumnPicker } from "./JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "./JoinConditionOperatorPicker";
import {
  ConditionNotebookCell,
  ConditionUnionLabel,
  ConditionContainer,
  TablesNotebookCell,
  RemoveConditionButton,
} from "./JoinStep.styled";
import { JoinStrategyPicker } from "./JoinStrategyPicker";
import { JoinTablePicker } from "./JoinTablePicker";
import { useJoin } from "./use-join";
import { useJoinCondition } from "./use-join-condition";

export function JoinStep({
  query,
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
    removeCondition,
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

  const isStartedFromModel = Boolean(sourceQuestion?.type?.() === "model");

  const handleStrategyChange = (nextStrategy: Lib.JoinStrategy) => {
    setStrategy(nextStrategy);
    if (join) {
      const nextJoin = Lib.withJoinStrategy(join, nextStrategy);
      const nextQuery = Lib.replaceClause(query, stageIndex, join, nextJoin);
      updateQuery(nextQuery);
    }
  };

  const handleTableChange = (nextTable: Lib.Joinable) => {
    setIsAddingNewCondition(false);
    const { nextQuery, hasConditions } = setTable(nextTable);
    if (nextQuery) {
      updateQuery(nextQuery);
    }
    if (!hasConditions) {
      setIsAddingNewCondition(true);
    }
  };

  const handleSelectedColumnsChange = (nextColumns: Lib.JoinFields) => {
    const nextQuery = setSelectedColumns(nextColumns);
    if (nextQuery) {
      updateQuery(nextQuery);
    }
  };

  const handleAddCondition = (condition: Lib.JoinCondition) => {
    const nextQuery = addCondition(condition);
    if (nextQuery) {
      updateQuery(nextQuery);
      setIsAddingNewCondition(false);
    }
  };

  const handleUpdateCondition = (
    conditionIndex: number,
    nextCondition: Lib.JoinCondition,
  ) => {
    const nextQuery = updateCondition(conditionIndex, nextCondition);
    if (nextQuery) {
      updateQuery(nextQuery);
    }
  };

  const handleRemoveCondition = (condition: Lib.JoinCondition) => {
    const nextQuery = removeCondition(condition);
    if (nextQuery) {
      updateQuery(nextQuery);
    }
  };

  const handleNewConditionClick = () => setIsAddingNewCondition(true);

  const renderJoinCondition = (
    condition?: Lib.JoinCondition,
    index?: number,
  ) => {
    if (!table) {
      return null;
    }

    const isComplete = !!condition && typeof index === "number";
    const key = isComplete ? `join-condition-${index}` : "new-join-condition";

    const isSingleCondition = isComplete
      ? conditions.length === 1
      : conditions.length === 0;
    const isLast = isAddingNewCondition
      ? !isComplete
      : index === conditions.length - 1;

    return (
      <Flex key={key} mr="6px" align="center" gap="8px" data-testid={key}>
        <JoinCondition
          query={query}
          stageIndex={stageIndex}
          condition={condition}
          join={join}
          table={table}
          readOnly={readOnly}
          canRemove={!isSingleCondition}
          onChange={nextCondition => {
            if (isComplete) {
              handleUpdateCondition(index, nextCondition);
            } else {
              handleAddCondition(nextCondition);
            }
          }}
          onChangeLHSColumn={setSelectedLHSColumn}
          onRemove={() => {
            if (isComplete) {
              handleRemoveCondition(condition);
            } else {
              setIsAddingNewCondition(false);
            }
          }}
        />
        <JoinConditionRightPart
          isComplete={isComplete}
          isLast={isLast}
          color={color}
          readOnly={readOnly}
          onNewCondition={handleNewConditionClick}
        />
      </Flex>
    );
  };

  return (
    <Flex miw="100%" gap="1rem">
      <TablesNotebookCell color={color}>
        <Flex direction="row" gap={6}>
          <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
            {lhsDisplayName}
          </NotebookCellItem>
          <JoinStrategyPicker
            query={query}
            stageIndex={stageIndex}
            strategy={strategy}
            readOnly={readOnly}
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
      </TablesNotebookCell>
      {!!table && (
        <>
          <Box mt="1.5rem">
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

interface JoinConditionRightPartProps {
  isComplete: boolean;
  isLast: boolean;
  color: string;
  readOnly?: boolean;
  onNewCondition: () => void;
}

function JoinConditionRightPart({
  isComplete,
  isLast,
  color,
  readOnly,
  onNewCondition,
}: JoinConditionRightPartProps) {
  if (!isLast) {
    return <ConditionUnionLabel>{t`and`}</ConditionUnionLabel>;
  }

  if (!readOnly && isComplete) {
    return (
      <NotebookCellAdd
        color={color}
        onClick={onNewCondition}
        aria-label={t`Add condition`}
      />
    );
  }

  return null;
}

interface JoinConditionProps {
  query: Lib.Query;
  stageIndex: number;
  condition?: Lib.JoinCondition;
  join?: Lib.Join;
  table: Lib.Joinable;
  readOnly?: boolean;
  canRemove: boolean;
  onChange: (condition: Lib.JoinCondition) => void;
  onChangeLHSColumn: (column: Lib.ColumnMetadata) => void;
  onRemove: () => void;
}

function JoinCondition({
  query,
  stageIndex,
  condition,
  join,
  table,
  readOnly,
  canRemove,
  onChange,
  onChangeLHSColumn,
  onRemove,
}: JoinConditionProps) {
  const {
    lhsColumn,
    rhsColumn,
    operator,
    operators,
    setOperator,
    setLHSColumn,
    setRHSColumn,
  } = useJoinCondition(query, stageIndex, table, join, condition);

  const getLhsColumnGroup = () => {
    const lhsColumns = Lib.joinConditionLHSColumns(
      query,
      stageIndex,
      join || table,
      lhsColumn,
      rhsColumn,
    );

    return Lib.groupColumns(lhsColumns);
  };

  const getRhsColumnGroup = () => {
    const rhsColumns = Lib.joinConditionRHSColumns(
      query,
      stageIndex,
      join || table,
      lhsColumn,
      rhsColumn,
    );

    return Lib.groupColumns(rhsColumns);
  };

  const isNewCondition = !condition;
  const isComplete = Boolean(lhsColumn && rhsColumn && operator);

  const [isLHSPickerOpened, setIsLHSPickerOpened] = useState(isNewCondition);
  const [isRHSPickerOpened, setIsRHSPickerOpened] = useState(false);

  const handleOperatorChange = (operator: Lib.JoinConditionOperator) => {
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
      setIsRHSPickerOpened(true);
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
    <ConditionContainer isComplete={isComplete}>
      <Flex align="center" gap="4px" mih="47px" p="4px">
        <Box ml={!lhsColumn ? "4px" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            column={lhsColumn}
            getColumnGroups={getLhsColumnGroup}
            isNewCondition={isNewCondition}
            label={t`Left column`}
            isOpened={isLHSPickerOpened}
            withDefaultBucketing={!rhsColumn}
            readOnly={readOnly}
            onSelect={handleLHSColumnChange}
            onOpenedChange={setIsLHSPickerOpened}
            data-testid="lhs-column-picker"
          />
        </Box>
        <JoinConditionOperatorPicker
          query={query}
          stageIndex={stageIndex}
          operator={operator}
          operators={operators}
          disabled={readOnly}
          isConditionComplete={isComplete}
          onChange={handleOperatorChange}
        />
        <Box mr={!rhsColumn ? "4px" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            column={rhsColumn}
            getColumnGroups={getRhsColumnGroup}
            table={table}
            isNewCondition={isNewCondition}
            label={t`Right column`}
            isOpened={isRHSPickerOpened}
            withDefaultBucketing={!lhsColumn}
            readOnly={readOnly}
            onSelect={handleRHSColumnChange}
            onOpenedChange={setIsRHSPickerOpened}
            data-testid="rhs-column-picker"
          />
        </Box>
      </Flex>
      {!readOnly && canRemove && (
        <RemoveConditionButton
          onClick={onRemove}
          isConditionComplete={isComplete}
          aria-label={t`Remove condition`}
        >
          <Icon name="close" size={16} />
        </RemoveConditionButton>
      )}
    </ConditionContainer>
  );
}
