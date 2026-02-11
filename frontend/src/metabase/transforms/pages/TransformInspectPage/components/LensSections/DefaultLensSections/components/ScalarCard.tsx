import { Card, Loader, Stack, Text } from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";
import { CardAlerts } from "../../../CardAlerts";
import { CardDrills } from "../../../CardDrills";
import { useLensContentContext } from "../../../LensContent/LensContentContext";

type ScalarCardProps = {
  card: InspectorCard;
};

export const ScalarCard = ({ card }: ScalarCardProps) => {
  const { lens, alertsByCardId, drillLensesByCardId, onStatsReady } =
    useLensContentContext();
  const { data, isLoading } = useLensCardLoader({
    lensId: lens.id,
    card,
    onStatsReady,
  });

  const alerts = alertsByCardId[card.id] ?? [];
  const drillLenses = drillLensesByCardId[card.id] ?? [];
  const value = data?.data?.rows?.[0]?.[0];

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
            {value?.toString() ?? "-"}
          </Text>
        )}

        <CardAlerts alerts={alerts} fullWidth />

        <CardDrills drillLenses={drillLenses} />
      </Stack>
    </Card>
  );
};
