import { t } from "ttag";

import { Card, Flex, Loader, Stack, Text } from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";
import type { CardStats, LensRef } from "../../../../types";
import { CardAlerts } from "../../../CardAlerts";
import { CardDrills } from "../../../CardDrills";

type BaseCountDisplayCardProps = {
  lensId: string;
  card: InspectorCard;
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const BaseCountDisplayCard = ({
  lensId,
  card,
  alerts,
  drillLenses,
  onStatsReady,
  onDrill,
}: BaseCountDisplayCardProps) => {
  const { data, isLoading } = useLensCardLoader({ lensId, card, onStatsReady });

  const value = data?.data?.rows?.[0]?.[0];

  return (
    <Card p="sm" shadow="none" withBorder>
      <Stack gap="xs">
        <Flex gap="sm" align="center">
          <Text fw={500}>{t`Base row count:`}</Text>
          {isLoading ? (
            <Loader size="xs" />
          ) : (
            <Text>{value?.toString() ?? "-"}</Text>
          )}
        </Flex>

        <CardAlerts alerts={alerts} cardId={card.id} />

        <CardDrills
          drillLenses={drillLenses}
          cardId={card.id}
          onDrill={onDrill}
        />
      </Stack>
    </Card>
  );
};
