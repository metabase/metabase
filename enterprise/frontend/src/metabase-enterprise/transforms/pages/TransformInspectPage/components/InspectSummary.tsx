import { useMemo } from "react";
import { t } from "ttag";

import {
  Box,
  Card,
  SimpleGrid,
  Stack,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  TransformInspectJoin,
  TransformInspectSource,
  TransformInspectSummary,
  TransformInspectSummaryTable,
} from "metabase-types/api";

type InspectSummaryProps = {
  summary: TransformInspectSummary;
  joins?: TransformInspectJoin[];
  sources?: TransformInspectSource[];
};

type SummaryTableRow = TransformInspectSummaryTable & { id: string };

const enrichWithId = (
  table: TransformInspectSummaryTable,
): SummaryTableRow => ({
  ...table,
  id: table.table_name,
});

export const InspectSummary = ({
  summary,
  joins,
  sources,
}: InspectSummaryProps) => {
  const inputData = useMemo(
    () => orderInputTables(summary.inputs, joins, sources).map(enrichWithId),
    [summary.inputs, joins, sources],
  );
  const outputData = useMemo(
    () => [enrichWithId(summary.output)],
    [summary.output],
  );

  const columns = useMemo<TreeTableColumnDef<SummaryTableRow>[]>(
    () => [
      {
        id: "table_name",
        header: t`Table`,
        cell: ({ row }) => <Text size="sm">{row.original.table_name}</Text>,
      },
      {
        id: "row_count",
        header: t`Rows`,
        width: 100,
        cell: ({ row }) => (
          <Text size="sm" ta="right">
            {row.original.row_count?.toLocaleString() ?? "-"}
          </Text>
        ),
      },
      {
        id: "column_count",
        header: t`Columns`,
        width: 100,
        cell: ({ row }) => (
          <Text size="sm" ta="right">
            {row.original.column_count}
          </Text>
        ),
      },
    ],
    [],
  );

  const inputInstance = useTreeTableInstance({
    data: inputData,
    columns,
    getNodeId: (node) => node.id,
  });

  const outputInstance = useTreeTableInstance({
    data: outputData,
    columns,
    getNodeId: (node) => node.id,
  });

  return (
    <Stack gap="md">
      <Title order={2}>{t`Summary`}</Title>
      <SimpleGrid cols={2} spacing="md">
        <Title order={4}>{t`Input table(s)`}</Title>
        <Title order={4}>{t`Output table`}</Title>
      </SimpleGrid>

      <Box
        bg="background-tertiary"
        bdrs="md"
        p="md"
        bd="1px solid var(--mb-color-border)"
      >
        <SimpleGrid cols={2} spacing="md">
          <Card p={0} shadow="none" withBorder>
            <TreeTable instance={inputInstance} />
          </Card>
          <Card p={0} shadow="none" withBorder>
            <TreeTable instance={outputInstance} />
          </Card>
        </SimpleGrid>
      </Box>
    </Stack>
  );
};

function orderInputTables(
  inputs: TransformInspectSummaryTable[],
  joins?: TransformInspectJoin[],
  sources?: TransformInspectSource[],
): TransformInspectSummaryTable[] {
  if (!joins || !sources || joins.length === 0) {
    return inputs;
  }

  const nameToId = new Map(
    sources.map((source) => [source.table_name, source.table_id]),
  );

  const joinedTableIds = joins.map((join) => join.source_table);
  const joinedTableIdSet = new Set(joinedTableIds);
  const mainTable = inputs.find((input) => {
    const tableId = nameToId.get(input.table_name);
    return tableId && !joinedTableIdSet.has(tableId);
  });

  const joinedTables = joinedTableIds
    .map((tableId) => {
      const source = sources.find((s) => s.table_id === tableId);
      return source
        ? inputs.find((input) => input.table_name === source.table_name)
        : undefined;
    })
    .filter((table): table is TransformInspectSummaryTable => table != null);

  return mainTable ? [mainTable, ...joinedTables] : inputs;
}
