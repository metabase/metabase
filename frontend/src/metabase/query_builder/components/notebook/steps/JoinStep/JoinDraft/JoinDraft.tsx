import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import { JoinConditionCell, JoinCell } from "./JoinDraft.styled";
import { getDefaultJoinStrategy } from "./utils";

interface JoinDraftProps {
  query: Lib.Query;
  stageIndex: number;
  color: string;
  isReadOnly: boolean;
  onChange: (join: Lib.Join) => void;
}

export function JoinDraft({
  query,
  stageIndex,
  color,
  isReadOnly,
  onChange,
}: JoinDraftProps) {
  const [strategy, setStrategy] = useState(() =>
    getDefaultJoinStrategy(query, stageIndex),
  );
  const [joinable, setJoinable] = useState<Lib.Joinable>();
  const [lhsColumn, setLhsColumn] = useState<Lib.ColumnMetadata>();

  const lhsDisplayName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, joinable, lhsColumn),
    [query, stageIndex, joinable, lhsColumn],
  );

  const handleConditionChange = (newCondition: Lib.JoinCondition) => {
    if (joinable) {
      const newJoin = Lib.joinClause(joinable, [newCondition]);
      onChange(newJoin);
    }
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
            onChange={setStrategy}
          />
          <JoinTablePicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
            color={color}
            isReadOnly={isReadOnly}
            onChange={setJoinable}
          />
        </Flex>
      </JoinCell>
      {joinable && (
        <>
          <Box mt="1.5rem">
            <Text color="brand" weight="bold">{t`on`}</Text>
          </Box>
          <JoinConditionCell color={color}>
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              joinable={joinable}
              isReadOnly={isReadOnly}
              onChange={handleConditionChange}
              onLhsColumnChange={setLhsColumn}
            />
          </JoinConditionCell>
        </>
      )}
    </Flex>
  );
}
