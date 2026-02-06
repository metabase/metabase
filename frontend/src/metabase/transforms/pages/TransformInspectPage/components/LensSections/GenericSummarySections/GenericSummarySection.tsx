import { useCallback, useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

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
import { FieldInfoSection } from "../../FieldInfoSection/FieldInfoSection";

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

const treeTableStyles = {
  headerRow: {
    backgroundColor: "var(--mb-color-background-secondary)",
  },
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

  const columns = useMemo<TreeTableColumnDef<TableRow>[]>(() => {
    return [
      {
        id: "table_name",
        header: t`Table`,
        accessorFn: (original) =>
          original.card.title.replace(/ Row Count$/, ""),
        cell: (props) => {
          return <Text>{String(props.getValue())}</Text>;
        },
      },
      {
        id: "row_count",
        header: t`Rows`,
        cell: ({ row }) => renderRowCountCard(row.original.card),
      },
      {
        id: "column_count",
        header: t`Columns`,
        cell: ({ row }) => (
          <Text ta="right">
            {row.original.columnCount?.toLocaleString() ?? "-"}
          </Text>
        ),
      },
    ];
  }, [renderRowCountCard]);

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

  const inputCount = inputData.length;

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <SimpleGrid cols={2} spacing="lg">
          <Title order={4}>
            {ngettext(
              msgid`${inputCount} input table`,
              `${inputCount} input tables`,
              inputCount,
            )}
          </Title>
          {/** we always expect to have one output table */}
          <Title order={4}>{t`1 output table`}</Title>
        </SimpleGrid>

        <Box>
          <SimpleGrid cols={2} spacing="lg">
            <Card p={0} shadow="none" withBorder>
              <TreeTable instance={inputInstance} styles={treeTableStyles} />
            </Card>
            <Card p={0} shadow="none" withBorder>
              <TreeTable instance={outputInstance} styles={treeTableStyles} />
            </Card>
          </SimpleGrid>
        </Box>
      </Stack>
      <FieldInfoSection sources={sources} target={target} />
    </Stack>
  );
};
