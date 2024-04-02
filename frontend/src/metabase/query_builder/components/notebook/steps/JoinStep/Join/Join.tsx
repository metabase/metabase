import { useMemo, useState } from "react";
import { t } from "ttag";

import { JoinDraft } from "metabase/query_builder/components/notebook/steps/JoinStep/JoinDraft";
import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellAdd, NotebookCellItem } from "../../../NotebookCell";
import { JoinCondition } from "../JoinCondition";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTableColumnPicker } from "../JoinTableColumnPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import { JoinConditionCell, JoinCell } from "./Join.styled";

interface JoinProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  color: string;
  isReadOnly: boolean;
  isModelDataSource: boolean;
  onJoinChange: (newJoin: Lib.Join) => void;
  onQueryChange: (newQuery: Lib.Query) => void;
}

export function Join({
  query,
  stageIndex,
  join,
  color,
  isReadOnly,
  isModelDataSource,
  onJoinChange,
  onQueryChange,
}: JoinProps) {
  const strategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const rhsTable = useMemo(() => Lib.joinedThing(query, join), [query, join]);
  const conditions = useMemo(() => Lib.joinConditions(join), [join]);
  const [draftRhsTable, setDraftRhsTable] = useState<Lib.Joinable>();
  const [isAddingNewCondition, setIsAddingNewCondition] = useState(false);

  const lhsTableName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, join),
    [query, stageIndex, join],
  );

  const rhsTableName = useMemo(
    () => Lib.displayInfo(query, stageIndex, rhsTable).displayName,
    [query, stageIndex, rhsTable],
  );

  const handleJoinChange = (newJoin: Lib.Join) => {
    setDraftRhsTable(undefined);
    onJoinChange(newJoin);
  };

  const handleStrategyChange = (newStrategy: Lib.JoinStrategy) => {
    const newJoin = Lib.withJoinStrategy(join, newStrategy);
    onJoinChange(newJoin);
  };

  const handleTableChange = (newTable: Lib.Joinable) => {
    const newConditions = Lib.suggestedJoinConditions(
      query,
      stageIndex,
      newTable,
    );
    if (newConditions.length) {
      const newJoin = Lib.joinClause(newTable, newConditions);
      onJoinChange(newJoin);
    } else {
      setDraftRhsTable(newTable);
    }
  };

  const handleAddCondition = (newCondition: Lib.JoinCondition) => {
    const newConditions = [...conditions, newCondition];
    const newJoin = Lib.withJoinConditions(join, newConditions);
    onJoinChange(newJoin);
    setIsAddingNewCondition(false);
  };

  const handleUpdateCondition = (
    newCondition: Lib.JoinCondition,
    conditionIndex: number,
  ) => {
    const newConditions = [...conditions];
    newConditions[conditionIndex] = newCondition;
    const newJoin = Lib.withJoinConditions(join, newConditions);
    onJoinChange(newJoin);
  };

  const handleRemoveCondition = (conditionIndex: number) => {
    const newConditions = [...conditions];
    newConditions.splice(conditionIndex, 1);
    const newJoin = Lib.withJoinConditions(join, newConditions);
    onJoinChange(newJoin);
  };

  if (draftRhsTable) {
    return (
      <JoinDraft
        query={query}
        stageIndex={stageIndex}
        color={color}
        initialStrategy={strategy}
        initialRhsTable={draftRhsTable}
        isReadOnly={isReadOnly}
        isModelDataSource={isModelDataSource}
        onJoinChange={handleJoinChange}
      />
    );
  }

  return (
    <Flex miw="100%" gap="1rem">
      <JoinCell color={color}>
        <Flex direction="row" gap={6}>
          <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
            {lhsTableName}
          </NotebookCellItem>
          <JoinStrategyPicker
            query={query}
            stageIndex={stageIndex}
            strategy={strategy}
            isReadOnly={isReadOnly}
            onChange={handleStrategyChange}
          />
          <JoinTablePicker
            query={query}
            table={rhsTable}
            tableName={rhsTableName}
            color={color}
            isReadOnly={isReadOnly}
            isModelDataSource={isModelDataSource}
            columnPicker={
              <JoinTableColumnPicker
                query={query}
                stageIndex={stageIndex}
                join={join}
                onChange={onQueryChange}
              />
            }
            onChange={handleTableChange}
          />
        </Flex>
      </JoinCell>
      <Box mt="1.5rem">
        <Text color="brand" weight="bold">{t`on`}</Text>
      </Box>
      <JoinConditionCell color={color}>
        {conditions.map((condition, index) => {
          const testId = `join-condition-${index}`;
          const isLast = index === conditions.length - 1;

          return (
            <Flex key={index} align="center" gap="sm" data-testid={testId}>
              <JoinCondition
                query={query}
                stageIndex={stageIndex}
                join={join}
                condition={condition}
                lhsTableName={lhsTableName}
                rhsTableName={rhsTableName}
                isReadOnly={isReadOnly}
                isRemovable={conditions.length > 1}
                onChange={newCondition =>
                  handleUpdateCondition(newCondition, index)
                }
                onRemove={() => handleRemoveCondition(index)}
              />
              {!isLast && <Text color="text-dark">{t`and`}</Text>}
              {isLast && !isReadOnly && !isAddingNewCondition && (
                <NotebookCellAdd
                  color={color}
                  onClick={() => setIsAddingNewCondition(true)}
                  aria-label={t`Add condition`}
                />
              )}
            </Flex>
          );
        })}
        {isAddingNewCondition && (
          <Flex data-testid="new-join-condition">
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              joinable={join}
              lhsTableName={lhsTableName}
              rhsTableName={rhsTableName}
              isReadOnly={isReadOnly}
              isRemovable={true}
              onChange={handleAddCondition}
              onRemove={() => setIsAddingNewCondition(false)}
            />
          </Flex>
        )}
      </JoinConditionCell>
    </Flex>
  );
}
