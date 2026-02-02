import { useCallback, useMemo } from "react";
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
  InspectorCard,
  InspectorLens,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import type { CardStats } from "../../../types";

import { FieldInfoSection } from "./components/FieldInfoSection";
import { RowCountCard } from "./components/RowCountCard";

type GenericSummarySectionProps = {
  lens: InspectorLens;
  cards: InspectorCard[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

type TableRow = {
  id: string;
  card: InspectorCard;
  columnCount?: number;
};

export const GenericSummarySection = ({
  lens,
  cards,
  sources,
  target,
  onStatsReady,
}: GenericSummarySectionProps) => {
  const { inputData, outputData } = useMemo(() => {
    const input: TableRow[] = [];
    const output: TableRow[] = [];
    for (const card of cards) {
      const groupRole = card.metadata?.group_role;
      const tableId = card.metadata?.table_id;
      if (groupRole === "output") {
        output.push({ id: card.id, card, columnCount: target?.column_count });
      } else {
        const source = sources.find((source) => source.table_id === tableId);
        input.push({ id: card.id, card, columnCount: source?.column_count });
      }
    }
    return { inputData: input, outputData: output };
  }, [cards, sources, target]);

  const renderRowCountCard = useCallback(
    (card: InspectorCard) => (
      <RowCountCard lensId={lens.id} card={card} onStatsReady={onStatsReady} />
    ),
    [lens.id, onStatsReady],
  );

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
        cell: ({ row }) => renderRowCountCard(row.original.card),
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
    [renderRowCountCard],
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
      <Box
        bg="background-tertiary"
        bdrs="md"
        p="md"
        bd="1px solid var(--mb-color-border)"
      >
        <FieldInfoSection sources={sources} target={target} />
      </Box>
    </Stack>
  );
};
