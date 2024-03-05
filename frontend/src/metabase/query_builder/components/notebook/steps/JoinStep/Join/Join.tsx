import { useMemo } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
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

  const lhsDisplayName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, join),
    [query, stageIndex, join],
  );

  const handleStrategyChange = (newStrategy: Lib.JoinStrategy) => {
    const newJoin = Lib.withJoinStrategy(join, newStrategy);
    onChange(newJoin);
  };

  const handleConditionAdd = (newCondition: Lib.JoinCondition) => {
    const newJoin = Lib.withJoinConditions(join, [...conditions, newCondition]);
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
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              table={table}
              isReadOnly={isReadOnly}
              onChange={handleConditionAdd}
            />
          </JoinConditionCell>
        </>
      )}
    </Flex>
  );
}
