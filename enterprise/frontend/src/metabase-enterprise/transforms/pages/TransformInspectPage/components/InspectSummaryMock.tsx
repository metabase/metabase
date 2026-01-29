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

// Types for summary table
type SummaryTableRow = {
  id: string;
  table_name: string;
  column_count: number;
};

interface TransformField {
  id: number;
  name: string;
  "display-name": string;
  "base-type": string;
  "semantic-type"?: string;
}

export interface TransformSourceMock {
  "table-id": number;
  "table-name": string;
  schema: string;
  "db-id": number;
  "column-count": number;
  fields: TransformField[];
}

export interface TransformTargetMock {
  "table-id": number;
  "table-name": string;
  schema: string;
  "column-count": number;
  fields: TransformField[];
}

type InspectSummaryMockProps = {
  sources: TransformSourceMock[];
  target: TransformTargetMock;
};

export const InspectSummaryMock = ({
  sources,
  target,
}: InspectSummaryMockProps) => {
  const inputData = useMemo<SummaryTableRow[]>(
    () =>
      sources.map((source) => ({
        id: source["table-name"],
        table_name: `${source.schema}.${source["table-name"]}`,
        column_count: source["column-count"],
      })),
    [sources],
  );

  const outputData = useMemo<SummaryTableRow[]>(
    () => [
      {
        id: target["table-name"],
        table_name: `${target.schema}.${target["table-name"]}`,
        column_count: target["column-count"],
      },
    ],
    [target],
  );

  const columns = useMemo<TreeTableColumnDef<SummaryTableRow>[]>(
    () => [
      {
        id: "table_name",
        header: t`Table`,
        cell: ({ row }) => <Text size="sm">{row.original.table_name}</Text>,
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
