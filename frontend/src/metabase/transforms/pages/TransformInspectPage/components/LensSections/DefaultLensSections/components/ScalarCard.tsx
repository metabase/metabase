import { Card, Loader, Stack, Text } from "metabase/ui";
import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";
import { CardAlerts } from "../../../CardAlerts";
import { CardDrills } from "../../../CardDrills";

type ScalarCardProps = {
  lensId: string;
  card: InspectorCard;
  alerts?: TriggeredAlert[];
  drillLenses?: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const ScalarCard = ({
  lensId,
  card,
  alerts = [],
  drillLenses = [],
  onStatsReady,
  onDrill,
}: ScalarCardProps) => {
  const { data, isLoading } = useLensCardLoader({ lensId, card, onStatsReady });

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

        <CardDrills drillLenses={drillLenses} onDrill={onDrill} />
      </Stack>
    </Card>
  );
};
