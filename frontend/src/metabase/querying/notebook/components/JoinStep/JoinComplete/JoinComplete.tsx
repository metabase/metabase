import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnPickerSidePanel } from "../../ColumnPickerSidePanel";
import type { FieldPickerItem } from "../../FieldPicker";
import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../../NotebookCell";
import { JoinCondition } from "../JoinCondition";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import S from "./JoinComplete.module.css";

interface JoinCompleteProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  joinPosition: number;
  color: string;
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
  const strategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const rhsTable = useMemo(() => Lib.joinedThing(query, join), [query, join]);
  const conditions = useMemo(() => Lib.joinConditions(join), [join]);
  const [isAddingNewCondition, setIsAddingNewCondition] = useState(false);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

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

  const columns = useMemo(
    () => Lib.joinableColumns(query, stageIndex, join),
    [query, stageIndex, join],
  );

  const isColumnSelected = ({ columnInfo }: FieldPickerItem) => {
    return Boolean(columnInfo.selected);
  };

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const newQuery = isSelected
      ? Lib.addField(query, stageIndex, column)
      : Lib.removeField(query, stageIndex, column);
    onQueryChange(newQuery);
  };

  const handleSelectAll = () => {
    const newJoin = Lib.withJoinFields(join, "all");
    const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
    onQueryChange(newQuery);
  };

  const handleSelectNone = () => {
    const newJoin = Lib.withJoinFields(join, "none");
    const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
    onQueryChange(newQuery);
  };

  return (
    <>
      <Flex direction={{ base: "column", md: "row" }} gap="sm">
        <NotebookCell className={S.JoinCell} color={color}>
          <Flex gap={6}>
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
              stageIndex={stageIndex}
              table={rhsTable}
              color={color}
              isReadOnly={isReadOnly}
              onOpenColumnPicker={() => setIsColumnPickerOpen(true)}
              onChange={handleTableChange}
            />
          </Flex>
        </NotebookCell>
        <Box mt={{ md: "lg" }}>
          <Text color="brand" fw="bold">{t`on`}</Text>
        </Box>
        <NotebookCell className={S.JoinConditionCell} color={color}>
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

    <ColumnPickerSidePanel
      isOpen={isColumnPickerOpen}
      onClose={() => setIsColumnPickerOpen(false)}
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      title={t`Pick columns`}
      isColumnSelected={isColumnSelected}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      data-testid="join-complete-column-picker"
    />
    </>
  );
}
