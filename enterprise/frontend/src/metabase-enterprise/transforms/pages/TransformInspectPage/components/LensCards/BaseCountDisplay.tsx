import { useEffect } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { Alert, Card, Flex, Loader, Stack, Text } from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import type { CardStats, LensRef } from "../../types";
import { getAlertColor } from "../../utils";
import { DrillChips } from "../DrillChips";

type BaseCountDisplayProps = {
  card: InspectorCard;
  alerts: TriggeredAlert[];
  drillTriggers: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const BaseCountDisplay = ({
  card,
  alerts,
  drillTriggers,
  onStatsReady,
  onDrill,
}: BaseCountDisplayProps) => {
  const { data, isLoading } = useGetAdhocQueryQuery(card.dataset_query);
  const value = data?.data?.rows?.[0]?.[0];

  useEffect(() => {
    if (!isLoading && value != null) {
      onStatsReady(card.id, {
        rowCount: 1,
        firstRow: [value],
      });
    }
  }, [isLoading, value, card.id, onStatsReady]);

  const cardAlerts = alerts.filter((a) => a.condition.card_id === card.id);
  const cardDrills = drillTriggers.filter(
    (d) => d.condition.card_id === card.id,
  );

  return (
    <Card p="sm" shadow="none" withBorder>
      <Stack gap="xs">
        <Flex gap="sm" align="center">
          <Text fw={500}>{t`Base row count:`}</Text>
          {isLoading ? (
            <Loader size="xs" />
          ) : (
            <Text>
              {typeof value === "number"
                ? value.toLocaleString()
                : String(value)}
            </Text>
          )}
        </Flex>
        {cardAlerts.length > 0 && (
          <Stack gap="xs">
            {cardAlerts.map((alert) => (
              <Alert
                key={alert.id}
                color={getAlertColor(alert.severity)}
                variant="light"
              >
                {alert.message}
              </Alert>
            ))}
          </Stack>
        )}
        <DrillChips drills={cardDrills} onDrill={onDrill} />
      </Stack>
    </Card>
  );
};
