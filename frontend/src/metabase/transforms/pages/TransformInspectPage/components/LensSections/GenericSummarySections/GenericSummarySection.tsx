import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
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
  ConcreteTableId,
  InspectorCard,
  InspectorSource,
  InspectorTarget,
} from "metabase-types/api";

import { FieldInfoSection } from "./components/FieldInfoSection/FieldInfoSection";
import { RowCountCard } from "./components/RowCountCard";
import { treeTableStyles } from "./styles";

type GenericSummarySectionProps = {
  cards: InspectorCard[];
  sources: InspectorSource[];
  target?: InspectorTarget;
};

type TableRow = {
  id: string;
  card: InspectorCard;
  columnCount?: number;
};

export const GenericSummarySection = ({
  cards,
  sources,
  target,
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

  const columns = useMemo<TreeTableColumnDef<TableRow>[]>(
    () => [
      {
        id: "table_name",
        header: t`Table`,
        accessorFn: (original) =>
          getTableName(
            original.card.metadata.table_id,
            [...sources, target].filter((t) => t !== undefined),
          ),
        cell: (props) => (
          <Ellipsified>{String(props.getValue() ?? "-")}</Ellipsified>
        ),
      },
      {
        id: "row_count",
        header: t`Rows`,
        cell: ({ row }) => <RowCountCard card={row.original.card} />,
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
    ],
    [sources, target],
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

  const inputCount = inputData.length;

  return (
    <Stack gap="xl">
      <Stack gap="md" data-testid="generic-summary-tables">
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

function getTableName(
  tableId: ConcreteTableId | undefined,
  tables: Array<InspectorSource | InspectorTarget>,
): string | undefined {
  if (!tableId) {
    return undefined;
  }
  const table = tables.find((table) => table.table_id === tableId);
  return table?.table_name;
}
