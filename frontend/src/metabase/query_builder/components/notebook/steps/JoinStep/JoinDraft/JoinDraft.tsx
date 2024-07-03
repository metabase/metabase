import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTableColumnDraftPicker } from "../JoinTableColumnDraftPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import { JoinCell, JoinConditionCell } from "./JoinDraft.styled";
import { getDefaultJoinStrategy, getJoinFields } from "./utils";

interface JoinDraftProps {
  query: Lib.Query;
  stageIndex: number;
  color: string;
  initialStrategy?: Lib.JoinStrategy;
  initialRhsTable?: Lib.Joinable;
  isReadOnly: boolean;
  onJoinChange: (join: Lib.Join) => void;
}

export function JoinDraft({
  query,
  stageIndex,
  color,
  initialStrategy,
  initialRhsTable,
  isReadOnly,
  onJoinChange,
}: JoinDraftProps) {
  const databaseId = Lib.databaseID(query);
  const [strategy, setStrategy] = useState(
    () => initialStrategy ?? getDefaultJoinStrategy(query, stageIndex),
  );
  const [rhsTable, setRhsTable] = useState(initialRhsTable);
  const [rhsTableColumns, setRhsTableColumns] = useState(() =>
    initialRhsTable
      ? Lib.joinableColumns(query, stageIndex, initialRhsTable)
      : [],
  );
  const [selectedRhsTableColumns, setSelectedRhsTableColumns] =
    useState(rhsTableColumns);
  const [lhsColumn, setLhsColumn] = useState<Lib.ColumnMetadata>();

  const lhsTableName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, rhsTable, lhsColumn),
    [query, stageIndex, rhsTable, lhsColumn],
  );

  const rhsTableName = useMemo(
    () =>
      rhsTable
        ? Lib.displayInfo(query, stageIndex, rhsTable).displayName
        : undefined,
    [query, stageIndex, rhsTable],
  );

  const handleTableChange = (newTable: Lib.Joinable) => {
    const newConditions = Lib.suggestedJoinConditions(
      query,
      stageIndex,
      newTable,
    );
    if (newConditions.length > 0) {
      const newJoin = Lib.joinClause(newTable, newConditions, strategy);
      onJoinChange(newJoin);
    } else {
      const newColumns = Lib.joinableColumns(query, stageIndex, newTable);
      setRhsTable(newTable);
      setRhsTableColumns(newColumns);
      setSelectedRhsTableColumns(newColumns);
    }
  };

  const handleConditionChange = (newCondition: Lib.JoinCondition) => {
    if (rhsTable) {
      const newJoin = Lib.withJoinFields(
        Lib.joinClause(rhsTable, [newCondition], strategy),
        getJoinFields(rhsTableColumns, selectedRhsTableColumns),
      );
      onJoinChange(newJoin);
    }
  };

  const resetStateRef = useLatest(() => {
    const rhsTableColumns = initialRhsTable
      ? Lib.joinableColumns(query, stageIndex, initialRhsTable)
      : [];

    setStrategy(initialStrategy ?? getDefaultJoinStrategy(query, stageIndex));
    setRhsTable(initialRhsTable);
    setRhsTableColumns(rhsTableColumns);
    setSelectedRhsTableColumns(rhsTableColumns);
    setLhsColumn(undefined);
  });

  useEffect(
    function resetStateOnDatabaseChange() {
      resetStateRef.current();
    },
    [databaseId, resetStateRef],
  );

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
            onChange={setStrategy}
          />
          <JoinTablePicker
            query={query}
            stageIndex={stageIndex}
            table={rhsTable}
            color={color}
            isReadOnly={isReadOnly}
            columnPicker={
              <JoinTableColumnDraftPicker
                query={query}
                stageIndex={stageIndex}
                columns={rhsTableColumns}
                selectedColumns={selectedRhsTableColumns}
                onChange={setSelectedRhsTableColumns}
              />
            }
            onChange={handleTableChange}
          />
        </Flex>
      </JoinCell>
      {rhsTable && (
        <>
          <Box mt="1.5rem">
            <Text color="brand" weight="bold">{t`on`}</Text>
          </Box>
          <JoinConditionCell color={color} data-testid="new-join-condition">
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              joinable={rhsTable}
              lhsTableName={lhsTableName}
              rhsTableName={rhsTableName}
              isReadOnly={isReadOnly}
              isRemovable={false}
              onChange={handleConditionChange}
              onLhsColumnChange={setLhsColumn}
            />
          </JoinConditionCell>
        </>
      )}
    </Flex>
  );
}
