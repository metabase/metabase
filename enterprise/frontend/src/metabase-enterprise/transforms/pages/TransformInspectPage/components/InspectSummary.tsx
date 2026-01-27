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
  TransformInspectSummary,
  TransformInspectSummaryTable,
} from "metabase-types/api";

type InspectSummaryProps = {
  summary: TransformInspectSummary;
};

type SummaryTableRow = TransformInspectSummaryTable & { id: string };

const enrichWithId = (
  table: TransformInspectSummaryTable,
): SummaryTableRow => ({
  ...table,
  id: table.table_name,
});

export const InspectSummary = ({ summary }: InspectSummaryProps) => {
  const inputData = useMemo(
    () => summary.inputs.map(enrichWithId),
    [summary.inputs],
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
