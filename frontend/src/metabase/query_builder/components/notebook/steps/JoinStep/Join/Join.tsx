import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellAdd, NotebookCellItem } from "../../../NotebookCell";
import { JoinCondition } from "../JoinCondition";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import { JoinConditionCell, JoinCell } from "./Join.styled";

interface JoinProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  color: string;
  isReadOnly: boolean;
  onChange: (join: Lib.Join) => void;
}

export function Join({
  query,
  stageIndex,
  join,
  color,
  isReadOnly,
  onChange,
}: JoinProps) {
  const strategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const table = useMemo(() => Lib.joinedThing(query, join), [query, join]);
  const conditions = useMemo(() => Lib.joinConditions(join), [join]);
  const [isAddingNewCondition, setIsAddingNewCondition] = useState(false);

  const lhsDisplayName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, join),
    [query, stageIndex, join],
  );

  const handleStrategyChange = (newStrategy: Lib.JoinStrategy) => {
    const newJoin = Lib.withJoinStrategy(join, newStrategy);
    onChange(newJoin);
  };

  const handleAddCondition = (newCondition: Lib.JoinCondition) => {
    const newConditions = [...conditions, newCondition];
    const newJoin = Lib.withJoinConditions(join, newConditions);
    onChange(newJoin);
    setIsAddingNewCondition(false);
  };

  const handleUpdateCondition = (
    newCondition: Lib.JoinCondition,
    conditionIndex: number,
  ) => {
    const newConditions = [...conditions];
    newConditions[conditionIndex] = newCondition;
    const newJoin = Lib.withJoinConditions(join, newConditions);
    onChange(newJoin);
  };

  const handleRemoveCondition = (conditionIndex: number) => {
    const newConditions = [...conditions];
    newConditions.splice(conditionIndex, 1);
    const newJoin = Lib.withJoinConditions(join, newConditions);
    onChange(newJoin);
  };

  return (
    <Flex miw="100%" gap="1rem">
      <JoinCell color={color}>
        <Flex direction="row" gap={6}>
          <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
            {lhsDisplayName}
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
            table={table}
            color={color}
            isReadOnly={isReadOnly}
          />
        </Flex>
      </JoinCell>
      {table && (
        <>
          <Box mt="1.5rem">
            <Text color="brand" weight="bold">{t`on`}</Text>
          </Box>
          <JoinConditionCell color={color}>
            {conditions.map((condition, conditionIndex) => {
              const isLast = conditionIndex === conditions.length - 1;

              return (
                <Flex key={conditionIndex} mr="6px" align="center" gap="8px">
                  <JoinCondition
                    key={conditionIndex}
                    query={query}
                    stageIndex={stageIndex}
                    join={join}
                    condition={condition}
                    isReadOnly={isReadOnly}
                    isRemovable={conditions.length > 1}
                    onChange={newCondition =>
                      handleUpdateCondition(newCondition, conditionIndex)
                    }
                    onRemove={() => handleRemoveCondition(conditionIndex)}
                  />
                  {isLast && <Text color="text-dark">{t`and`}</Text>}
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
              <JoinConditionDraft
                query={query}
                stageIndex={stageIndex}
                table={table}
                isReadOnly={isReadOnly}
                isRemovable={true}
                onChange={handleAddCondition}
                onRemove={() => setIsAddingNewCondition(false)}
              />
            )}
          </JoinConditionCell>
        </>
      )}
    </Flex>
  );
}
