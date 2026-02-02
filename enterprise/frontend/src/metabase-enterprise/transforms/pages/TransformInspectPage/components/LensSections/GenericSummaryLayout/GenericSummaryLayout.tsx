import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  Box,
  Card,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  InspectorCard,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import { FieldInfoSection } from "../../../../TransformInspectV2Page/components/FieldInfoSection";
import type { CardStats } from "../../../types";

type GenericSummaryLayoutProps = {
  cards: InspectorCard[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  onStatsReady: (cardId: string, stats: CardStats) => void;
};

type TableRow = {
  id: string;
  card: InspectorCard;
  columnCount?: number;
  onStatsReady: (cardId: string, stats: CardStats) => void;
};

const RowCountCell = ({
  card,
  onStatsReady,
}: {
  card: InspectorCard;
  onStatsReady: (cardId: string, stats: CardStats) => void;
}) => {
  const { data, isLoading } = useGetAdhocQueryQuery(card.dataset_query);
  const rowCount = data?.data?.rows?.[0]?.[0];

  useEffect(() => {
    if (!isLoading && rowCount != null) {
      onStatsReady(card.id, {
        rowCount: typeof rowCount === "number" ? rowCount : 1,
        firstRow: [rowCount],
      });
    }
  }, [isLoading, rowCount, card.id, onStatsReady]);

  if (isLoading) {
    return (
      <Box ta="right">
        <Loader size="xs" />
      </Box>
    );
  }

  return (
    <Text size="sm" ta="right">
      {typeof rowCount === "number"
        ? rowCount.toLocaleString()
        : String(rowCount ?? "-")}
    </Text>
  );
};

export const GenericSummaryLayout = ({
  cards,
  sources,
  target,
  onStatsReady,
}: GenericSummaryLayoutProps) => {
  const { inputData, outputData } = useMemo(() => {
    const input: TableRow[] = [];
    const output: TableRow[] = [];

    for (const card of cards) {
      const groupRole = card.metadata?.group_role as string | undefined;
      const tableId = card.metadata?.table_id as number | undefined;

      if (groupRole === "output") {
        output.push({
          id: card.id,
          card,
          columnCount: target?.column_count,
          onStatsReady,
        });
      } else {
        const source = sources.find((s) => s.table_id === tableId);
        input.push({
          id: card.id,
          card,
          columnCount: source?.column_count,
          onStatsReady,
        });
      }
    }

    return { inputData: input, outputData: output };
  }, [cards, sources, target, onStatsReady]);

  const columns = useMemo<TreeTableColumnDef<TableRow>[]>(
    () => [
      {
        id: "table_name",
        header: t`Table`,
        cell: ({ row }) => {
          const tableName = row.original.card.title.replace(/ Row Count$/, "");
          return <Text size="sm">{tableName}</Text>;
        },
      },
      {
        id: "row_count",
        header: t`Rows`,
        width: 100,
        cell: ({ row }) => (
          <RowCountCell
            card={row.original.card}
            onStatsReady={row.original.onStatsReady}
          />
        ),
      },
      {
        id: "column_count",
        header: t`Columns`,
        width: 100,
        cell: ({ row }) => (
          <Text size="sm" ta="right">
            {row.original.columnCount?.toLocaleString() ?? "-"}
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
      <SimpleGrid cols={2} spacing="md">
        <Title order={4}>{t`Input Tables`}</Title>
        <Title order={4}>{t`Output Table`}</Title>
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
      <FieldInfoSection sources={sources} target={target} />
    </Stack>
  );
};
