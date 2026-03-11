import { useMemo, useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/hooks";
import type { ColorName } from "metabase/lib/colors/types";
import { Flex, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../../NotebookCell";
import { JoinCondition } from "../JoinCondition";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTableColumnPicker } from "../JoinTableColumnPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import S from "./JoinComplete.module.css";

interface JoinCompleteProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  joinPosition: number;
  color: ColorName;
  isReadOnly: boolean;
  onJoinChange: (newJoin: Lib.Join) => void;
  onQueryChange: (newQuery: Lib.Query) => void;
  onDraftRhsTableChange: (newTable: Lib.Joinable) => void;
}

export function JoinComplete({
  query,
  stageIndex,
  join,
  joinPosition,
  color,
  isReadOnly,
  onJoinChange,
  onQueryChange,
  onDraftRhsTableChange,
}: JoinCompleteProps) {
  const tc = useTranslateContent();
  const strategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const rhsTable = useMemo(() => Lib.joinedThing(query, join), [query, join]);
  const conditions = useMemo(() => Lib.joinConditions(join), [join]);
  const [isAddingNewCondition, setIsAddingNewCondition] = useState(false);

  const lhsTableName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, join),
    [query, stageIndex, join],
  );

  const rhsTableName = useMemo(
    () => Lib.displayInfo(query, stageIndex, rhsTable).displayName,
    [query, stageIndex, rhsTable],
  );

  const handleStrategyChange = (newStrategy: Lib.JoinStrategy) => {
    const newJoin = Lib.withJoinStrategy(join, newStrategy);
    onJoinChange(newJoin);
  };

  const handleTableChange = (newTable: Lib.Joinable) => {
    const newConditions = Lib.suggestedJoinConditions(
      query,
      stageIndex,
      newTable,
      joinPosition,
    );
    if (newConditions.length) {
      const newJoin = Lib.joinClause(newTable, newConditions, strategy);
      onJoinChange(newJoin);
    } else {
      onDraftRhsTableChange(newTable);
    }
    setIsAddingNewCondition(false);
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

  return (
    <Flex direction={{ base: "column", md: "row" }} gap="sm">
      <NotebookCell className={S.JoinConditionCell} color={color}>
        <Flex gap={6} align="center">
          <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
            {tc(lhsTableName)}
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
            stageIndex={stageIndex}
            table={rhsTable}
            color={color}
            isReadOnly={isReadOnly}
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
      </NotebookCell>
      <Flex className={S.JoinConditionOn}>
        <Text c="brand" fw="bold">{t`on`}</Text>
      </Flex>
      <NotebookCell
        className={S.JoinConditionCell}
        color={color}
        p={rem("10px")}
      >
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
                onChange={(newCondition) =>
                  handleUpdateCondition(newCondition, index)
                }
                onRemove={() => handleRemoveCondition(index)}
              />
              {!isLast && <Text color="text-primary">{t`and`}</Text>}
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
              strategy={strategy}
              lhsTableName={lhsTableName}
              rhsTableName={rhsTableName}
              isReadOnly={isReadOnly}
              isRemovable={true}
              onChange={handleAddCondition}
              onRemove={() => setIsAddingNewCondition(false)}
            />
          </Flex>
        )}
      </NotebookCell>
    </Flex>
  );
}
