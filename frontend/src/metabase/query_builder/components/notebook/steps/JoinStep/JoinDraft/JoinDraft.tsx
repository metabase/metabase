import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTableColumnDraftPicker } from "../JoinTableColumnDraftPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import { JoinConditionCell, JoinCell } from "./JoinDraft.styled";
import { getDefaultJoinStrategy, getJoinFields } from "./utils";

interface JoinDraftProps {
  query: Lib.Query;
  stageIndex: number;
  color: string;
  isReadOnly: boolean;
  isModelDataSource: boolean;
  onJoinChange: (join: Lib.Join) => void;
}

export function JoinDraft({
  query,
  stageIndex,
  color,
  isReadOnly,
  isModelDataSource,
  onJoinChange,
}: JoinDraftProps) {
  const [strategy, setStrategy] = useState(() =>
    getDefaultJoinStrategy(query, stageIndex),
  );
  const [rhsTable, setRhsTable] = useState<Lib.Joinable>();
  const [rhsTableColumns, setRhsTableColumns] = useState<Lib.ColumnMetadata[]>(
    [],
  );
  const [selectedRhsTableColumns, setSelectedRhsTableColumns] = useState<
    Lib.ColumnMetadata[]
  >([]);
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
      const newJoin = Lib.joinClause(newTable, newConditions);
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
        Lib.joinClause(rhsTable, [newCondition]),
        getJoinFields(rhsTableColumns, selectedRhsTableColumns),
      );
      onJoinChange(newJoin);
    }
  };

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
            table={rhsTable}
            tableName={rhsTableName}
            color={color}
            isReadOnly={isReadOnly}
            isModelDataSource={isModelDataSource}
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
