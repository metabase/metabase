import { t } from "ttag";

import { SimpleGrid, Stack, Title } from "metabase/ui";
import type { TransformInspectColumnComparison } from "metabase-types/api";

import { ComparisonCard } from "./ComparisonCard";

type InspectColumnComparisonsProps = {
  comparisons: TransformInspectColumnComparison[];
};

export const InspectColumnComparisons = ({
  comparisons,
}: InspectColumnComparisonsProps) => (
  <Stack gap="md">
    <Title order={3}>{t`Column distributions`}</Title>
    <SimpleGrid cols={2} spacing="md">
      <Title order={4}>{t`Fields in input table(s)`}</Title>
      <Title order={4}>{`Fields in output table(s)`}</Title>
    </SimpleGrid>
    <Stack gap="lg">
      {comparisons.map((comparison) => {
        const inputCard = comparison.cards.find((c) => c.source === "input");
        const outputCard = comparison.cards.find((c) => c.source === "output");
        return (
          <SimpleGrid
            key={comparison.id}
            cols={2}
            spacing="md"
            bg="background-tertiary"
            bd="1px solid var(--mb-color-border)"
            bdrs="md"
            p="md"
          >
            <ComparisonCard card={inputCard} />
            <ComparisonCard card={outputCard} />
          </SimpleGrid>
        );
      })}
    </Stack>
  </Stack>
);
