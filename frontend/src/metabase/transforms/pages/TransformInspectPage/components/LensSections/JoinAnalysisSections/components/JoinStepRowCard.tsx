import { t } from "ttag";

import {
  Card,
  Code,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";
import type { CardStats, LensRef } from "../../../../types";
import { CardAlerts } from "../../../CardAlerts";
import { CardDrills } from "../../../CardDrills";
import { JOIN_ICONS, JOIN_LABELS } from "../constants";

import { TableCountCard } from "./TableCountCard";

type JoinStepRowCardProps = {
  lensId: string;
  card: InspectorCard;
  tableCard?: InspectorCard;
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lensRef: LensRef) => void;
};

type JoinStepStats = {
  output_count?: number;
  matched_count?: number;
  null_count?: number;
  null_rate?: number;
};

export const JoinStepRowCard = ({
  lensId,
  card,
  tableCard,
  alerts,
  drillLenses,
  onStatsReady,
  onDrill,
}: JoinStepRowCardProps) => {
  const { stats: rawStats, isLoading } = useLensCardLoader({
    lensId,
    card,
    onStatsReady,
  });

  const stats = rawStats as JoinStepStats | null;

  const alias = (card.metadata?.join_alias as string) ?? "Unknown";
  const strategy = (card.metadata?.join_strategy as string) ?? "left-join";

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="md">
        <Flex gap="lg" align="center" wrap="wrap">
          <Flex gap="xs" align="center" miw={150}>
            <Tooltip label={JOIN_LABELS[strategy] ?? strategy}>
              <Icon
                name={JOIN_ICONS[strategy] ?? "join_left_outer"}
                c="brand"
              />
            </Tooltip>
            <Code bg="transparent">{alias}</Code>
          </Flex>

          {isLoading ? (
            <Loader size="xs" />
          ) : (
            <>
              <Flex gap="xs" align="center">
                <Text size="sm" c="text-secondary">{t`Output:`}</Text>
                <Text size="sm" fw={500}>
                  {stats?.output_count?.toLocaleString() ?? "-"}
                </Text>
              </Flex>

              {stats?.matched_count != null && (
                <Flex gap="xs" align="center">
                  <Text size="sm" c="text-secondary">{t`Matched:`}</Text>
                  <Text size="sm" fw={500}>
                    {stats.matched_count.toLocaleString()}
                  </Text>
                </Flex>
              )}

              {tableCard && (
                <TableCountCard
                  lensId={lensId}
                  card={tableCard}
                  onStatsReady={onStatsReady}
                />
              )}
            </>
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
