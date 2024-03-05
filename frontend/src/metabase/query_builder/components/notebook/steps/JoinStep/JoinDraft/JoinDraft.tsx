import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import {
  JoinConditionNotebookCell,
  JoinNotebookCell,
} from "./JoinDraft.styled";
import {
  getDefaultJoinStrategy,
  getDefaultJoinConditionOperator,
} from "./utils";

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
  const [operator, setOperator] = useState(() =>
    getDefaultJoinConditionOperator(query, stageIndex),
  );
  const [lhsColumn, setLhsColumn] = useState<Lib.ColumnMetadata>();
  const [rhsColumn, setRhsColumn] = useState<Lib.ColumnMetadata>();

  const lhsDisplayName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, joinable),
    [query, stageIndex, joinable],
  );

  const handleColumnChange = (
    lhsColumn: Lib.ColumnMetadata | undefined,
    rhsColumn: Lib.ColumnMetadata | undefined,
  ) => {
    if (joinable != null && lhsColumn != null && rhsColumn != null) {
      const condition = Lib.joinConditionClause(
        query,
        stageIndex,
        operator,
        lhsColumn,
        rhsColumn,
      );
      const join = Lib.joinClause(joinable, [condition]);
      onChange(join);
    }
  };

  const handleLhsColumnChange = (newLhsColumn: Lib.ColumnMetadata) => {
    setLhsColumn(newLhsColumn);
    handleColumnChange(newLhsColumn, rhsColumn);
  };

  const handleRhsColumnChange = (newRhsColumn: Lib.ColumnMetadata) => {
    setRhsColumn(newRhsColumn);
    handleColumnChange(lhsColumn, newRhsColumn);
  };

  return (
    <Flex miw="100%" gap="1rem">
      <JoinNotebookCell color={color}>
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
      </JoinNotebookCell>
      {joinable && (
        <>
          <Box mt="1.5rem">
            <Text color="brand" weight="bold">{t`on`}</Text>
          </Box>
          <JoinConditionNotebookCell color={color}>
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              joinable={joinable}
              operator={operator}
              lhsColumn={lhsColumn}
              rhsColumn={rhsColumn}
              isReadOnly={isReadOnly}
              onOperatorChange={setOperator}
              onLhsColumnChange={handleLhsColumnChange}
              onRhsColumnChange={handleRhsColumnChange}
            />
          </JoinConditionNotebookCell>
        </>
      )}
    </Flex>
  );
}
