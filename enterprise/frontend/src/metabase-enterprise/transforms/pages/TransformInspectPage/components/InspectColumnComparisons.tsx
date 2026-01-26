import { t } from "ttag";

import { Box, Card, Code, SimpleGrid, Stack, Text, Title } from "metabase/ui";
import type {
  TransformInspectColumnComparison,
  TransformInspectComparisonCard,
} from "metabase-types/api";

type InspectColumnComparisonsProps = {
  comparisons: TransformInspectColumnComparison[];
};

const ComparisonCard = ({
  card,
}: {
  card: TransformInspectComparisonCard | undefined;
}) => {
  if (!card) {
    return <Box />;
  }

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="sm">
        <Text fw={600} size="sm">
          {card.title}
        </Text>
        <Code
          block
          style={{ fontSize: "11px", maxHeight: "200px", overflow: "auto" }}
        >
          {JSON.stringify(card, null, 2)}
        </Code>
      </Stack>
    </Card>
  );
};

export const InspectColumnComparisons = ({
  comparisons,
}: InspectColumnComparisonsProps) => (
  <Stack gap="md">
    <Title order={3}>{t`Column distributions`}</Title>
    <SimpleGrid cols={2} spacing="lg">
      <Text fw={600}>{t`Fields in input table(s)`}</Text>
      <Text fw={600}>{t`Fields in output table(s)`}</Text>
    </SimpleGrid>
    <Stack gap="md">
      {comparisons.map((comparison) => {
        const inputCard = comparison.cards.find((c) => c.source === "input");
        const outputCard = comparison.cards.find((c) => c.source === "output");
        return (
          <SimpleGrid key={comparison.id} cols={2} spacing="lg">
            <ComparisonCard card={inputCard} />
            <ComparisonCard card={outputCard} />
          </SimpleGrid>
        );
      })}
    </Stack>
  </Stack>
);
