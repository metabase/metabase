import { useEffect } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  Alert,
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

import type { CardStats, LensRef } from "../../types";
import { getAlertColor } from "../../utils";
import { DrillChips } from "../DrillChips";
import {
  JOIN_ICONS,
  JOIN_LABELS,
} from "../LensSections/JoinAnalysisLayout/constants";

type JoinStepRowProps = {
  stepCard: InspectorCard;
  tableCard?: InspectorCard;
  alerts: TriggeredAlert[];
  drillTriggers: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const JoinStepRow = ({
  stepCard,
  tableCard,
  alerts,
  drillTriggers,
  onStatsReady,
  onDrill,
}: JoinStepRowProps) => {
  const { data: stepData, isLoading: isStepLoading } = useGetAdhocQueryQuery(
    stepCard.dataset_query,
  );
  const { data: tableData, isLoading: isTableLoading } = useGetAdhocQueryQuery(
    tableCard?.dataset_query ?? skipToken,
  );

  const alias = (stepCard.metadata?.join_alias as string) ?? "Unknown";
  const strategy = (stepCard.metadata?.join_strategy as string) ?? "left-join";

  const rows = stepData?.data?.rows?.[0];
  const outputCount = rows?.[0] as number | undefined;
  const matchedCount = rows?.[1] as number | undefined;
  const tableCount = tableData?.data?.rows?.[0]?.[0] as number | undefined;

  const isLoading = isStepLoading || (tableCard && isTableLoading);

  const nullCount =
    outputCount != null && matchedCount != null
      ? outputCount - matchedCount
      : null;
  const nullRate =
    nullCount != null && outputCount != null && outputCount > 0
      ? nullCount / outputCount
      : null;

  useEffect(() => {
    if (!isLoading && outputCount != null) {
      onStatsReady(stepCard.id, {
        rowCount: outputCount,
        firstRow: rows,
        nullRate: nullRate ?? undefined,
        outputCount,
        matchedCount,
        nullCount: nullCount ?? undefined,
      });
    }
  }, [
    isLoading,
    outputCount,
    matchedCount,
    nullCount,
    rows,
    nullRate,
    stepCard.id,
    onStatsReady,
  ]);

  const cardAlerts = alerts.filter(
    (a) => a.condition["card-id"] === stepCard.id,
  );
  const cardDrills = drillTriggers.filter(
    (d) => d.condition["card-id"] === stepCard.id,
  );

  return (
    <Card p="sm" shadow="none" withBorder>
      <Stack gap="xs">
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
                  {outputCount?.toLocaleString() ?? "-"}
                </Text>
              </Flex>

              {matchedCount != null && (
                <Flex gap="xs" align="center">
                  <Text size="sm" c="text-secondary">{t`Matched:`}</Text>
                  <Text size="sm" fw={500}>
                    {matchedCount.toLocaleString()}
                  </Text>
                </Flex>
              )}

              {tableCount != null && (
                <Flex gap="xs" align="center">
                  <Text size="sm" c="text-secondary">{t`Table rows:`}</Text>
                  <Text size="sm" fw={500}>
                    {tableCount.toLocaleString()}
                  </Text>
                </Flex>
              )}

              {nullRate != null && nullRate > 0.05 && (
                <Tooltip
                  label={t`${nullCount?.toLocaleString()} rows (${Math.round(nullRate * 100)}%) have NULL join keys`}
                >
                  <Flex gap="xs" align="center">
                    <Icon
                      name="warning"
                      c={nullRate > 0.2 ? "error" : "warning"}
                      size={16}
                    />
                    <Text
                      size="sm"
                      c={nullRate > 0.2 ? "error" : "warning"}
                    >{t`${Math.round(nullRate * 100)}% unmatched`}</Text>
                  </Flex>
                </Tooltip>
              )}
            </>
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
