import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  Box,
  Card,
  Flex,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type {
  InspectorCard as InspectorCardType,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import { InspectorCard, ScalarCard } from "./InspectorCard";

type ComparisonSectionProps = {
  cards: InspectorCardType[];
  sources?: TransformInspectSource[];
  target?: TransformInspectTarget;
  asTable?: boolean;
};

type CardGroup = {
  groupId: string;
  inputCards: InspectorCardType[];
  outputCards: InspectorCardType[];
};

export const ComparisonSection = ({
  cards,
  sources,
  target,
  asTable,
}: ComparisonSectionProps) => {
  const groups = useMemo(() => {
    const groupMap = new Map<string, CardGroup>();

    for (const card of cards) {
      const metadata = card.metadata ?? {};
      const groupId = String(metadata.group_id ?? "default");
      const groupRole = metadata.group_role as "input" | "output" | undefined;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          groupId,
          inputCards: [],
          outputCards: [],
        });
      }

      const group = groupMap.get(groupId)!;
      if (groupRole === "output") {
        group.outputCards.push(card);
      } else {
        group.inputCards.push(card);
      }
    }

    // Sort cards within groups by group_order
    for (const group of groupMap.values()) {
      group.inputCards.sort(
        (a, b) =>
          ((a.metadata?.group_order as number) ?? 0) -
          ((b.metadata?.group_order as number) ?? 0),
      );
      group.outputCards.sort(
        (a, b) =>
          ((a.metadata?.group_order as number) ?? 0) -
          ((b.metadata?.group_order as number) ?? 0),
      );
    }

    return Array.from(groupMap.values());
  }, [cards]);

  // Use table layout for row counts
  if (asTable && sources) {
    const inputCards = groups.flatMap((g) => g.inputCards);
    const outputCards = groups.flatMap((g) => g.outputCards);
    return (
      <RowCountTables
        inputCards={inputCards}
        outputCards={outputCards}
        sources={sources}
        target={target}
      />
    );
  }

  // Check if all cards are scalars for compact display
  const allScalars = cards.every((c) => c.display === "scalar");

  if (allScalars) {
    return <ScalarComparisonLayout groups={groups} />;
  }

  return <ChartComparisonLayout groups={groups} />;
};

type RowCountTablesProps = {
  inputCards: InspectorCardType[];
  outputCards: InspectorCardType[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
};

const RowCountTables = ({
  inputCards,
  outputCards,
  sources,
  target,
}: RowCountTablesProps) => {
  return (
    <SimpleGrid cols={2} spacing="lg">
      <Stack gap="md">
        <Title order={4}>{t`Input Tables`}</Title>
        <Card p="md" shadow="none" withBorder>
          <Stack gap="xs">
            <Flex
              gap="md"
              fw={600}
              pb="xs"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Text style={{ flex: 2 }}>{t`Table`}</Text>
              <Text style={{ flex: 1 }} ta="right">{t`Rows`}</Text>
              <Text style={{ flex: 1 }} ta="right">{t`Columns`}</Text>
            </Flex>
            {inputCards.map((card) => {
              const tableId = card.metadata?.table_id as number | undefined;
              const source = sources.find((s) => s.table_id === tableId);
              return (
                <RowCountTableRow
                  key={card.id}
                  card={card}
                  columnCount={source?.column_count}
                />
              );
            })}
          </Stack>
        </Card>
      </Stack>

      <Stack gap="md">
        <Title order={4}>{t`Output Table`}</Title>
        <Card p="md" shadow="none" withBorder>
          <Stack gap="xs">
            <Flex
              gap="md"
              fw={600}
              pb="xs"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Text style={{ flex: 2 }}>{t`Table`}</Text>
              <Text style={{ flex: 1 }} ta="right">{t`Rows`}</Text>
              <Text style={{ flex: 1 }} ta="right">{t`Columns`}</Text>
            </Flex>
            {outputCards.map((card) => (
              <RowCountTableRow
                key={card.id}
                card={card}
                columnCount={target?.column_count}
              />
            ))}
          </Stack>
        </Card>
      </Stack>
    </SimpleGrid>
  );
};

type RowCountTableRowProps = {
  card: InspectorCardType;
  columnCount?: number;
};

const RowCountTableRow = ({ card, columnCount }: RowCountTableRowProps) => {
  const { data, isLoading } = useGetAdhocQueryQuery(card.dataset_query);
  const rowCount = data?.data?.rows?.[0]?.[0];

  // Extract table name from card title (e.g., "TableName Row Count" -> "TableName")
  const tableName = card.title.replace(/ Row Count$/, "");

  return (
    <Flex gap="md" py="xs">
      <Text style={{ flex: 2 }}>{tableName}</Text>
      <Box style={{ flex: 1 }} ta="right">
        {isLoading ? (
          <Loader size="xs" />
        ) : (
          <Text>
            {typeof rowCount === "number"
              ? rowCount.toLocaleString()
              : String(rowCount ?? "-")}
          </Text>
        )}
      </Box>
      <Text style={{ flex: 1 }} ta="right">
        {columnCount?.toLocaleString() ?? "-"}
      </Text>
    </Flex>
  );
};

const ScalarComparisonLayout = ({ groups }: { groups: CardGroup[] }) => {
  // For scalars, show input(s) → output in a row
  return (
    <Stack gap="md">
      {groups.map((group) => (
        <SimpleGrid
          key={group.groupId}
          cols={group.inputCards.length + group.outputCards.length}
          spacing="md"
        >
          {group.inputCards.map((card) => (
            <ScalarCard key={card.id} card={card} />
          ))}
          {group.outputCards.map((card) => (
            <ScalarCard key={card.id} card={card} />
          ))}
        </SimpleGrid>
      ))}
    </Stack>
  );
};

const ChartComparisonLayout = ({ groups }: { groups: CardGroup[] }) => {
  return (
    <Stack gap="lg">
      <SimpleGrid cols={2} spacing="md">
        <Title order={4}>{t`Input`}</Title>
        <Title order={4}>{t`Output`}</Title>
      </SimpleGrid>
      {groups.map((group) => (
        <Stack
          key={group.groupId}
          gap="md"
          bg="background-tertiary"
          bd="1px solid var(--mb-color-border)"
          style={{ borderRadius: "var(--mb-radius-md)" }}
          p="md"
        >
          <SimpleGrid cols={2} spacing="md">
            <Box>
              {group.inputCards.map((card) => (
                <InspectorCard key={card.id} card={card} showTitle />
              ))}
            </Box>
            <Box>
              {group.outputCards.map((card) => (
                <InspectorCard key={card.id} card={card} showTitle />
              ))}
            </Box>
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
};
