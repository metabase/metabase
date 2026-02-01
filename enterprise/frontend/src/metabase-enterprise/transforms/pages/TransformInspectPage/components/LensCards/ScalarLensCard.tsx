import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import { Card, Loader, Stack, Text } from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../hooks/useLensCardLoader";
import type { CardStats } from "../../types";

type ScalarLensCardProps = {
  card: InspectorCard;
  cardSummaries: Record<string, CardStats>;
  onStatsReady: (cardId: string, stats: CardStats) => void;
};

export const ScalarLensCard = ({
  card,
  cardSummaries,
  onStatsReady,
}: ScalarLensCardProps) => {
  const { isDegenerate } = useLensCardLoader(card, cardSummaries, onStatsReady);
  const { data: dataset, isLoading } = useGetAdhocQueryQuery(
    card.dataset_query,
  );

  const value = useMemo(() => {
    if (!dataset?.data?.rows?.[0]?.[0]) {
      return null;
    }
    const val = dataset.data.rows[0][0];
    return typeof val === "number" ? val.toLocaleString() : String(val);
  }, [dataset]);

  if (isDegenerate) {
    return null;
  }

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="xs" align="center">
        <Text size="sm" c="text-secondary">
          {card.title}
        </Text>
        {isLoading ? (
          <Loader size="sm" />
        ) : (
          <Text size="xl" fw={700}>
            {value ?? "-"}
          </Text>
        )}
      </Stack>
    </Card>
  );
};
