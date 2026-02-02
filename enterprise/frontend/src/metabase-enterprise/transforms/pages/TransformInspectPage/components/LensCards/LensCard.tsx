import { useMemo } from "react";

import {
  useGetAdhocQueryMetadataQuery,
  useGetAdhocQueryQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Alert, Box, Card, Loader, Stack, Title } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { getAlertColor } from "metabase-enterprise/transforms/pages/TransformInspectPage/utils";
import * as Lib from "metabase-lib";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import { defaultDisplay } from "metabase-lib/viz/display";
import type {
  CardDisplayType,
  InspectorCard,
  RawSeries,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { useLensCardLoader } from "../../hooks/useLensCardLoader";
import type { CardStats, LensRef } from "../../types";
import { DrillChips } from "../DrillChips";

type LensCardProps = {
  card: InspectorCard;
  cardSummaries: Record<string, CardStats>;
  alerts: TriggeredAlert[];
  drillTriggers: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats) => void;
  onDrill: (lensRef: LensRef) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 235;

export const LensCard = ({
  card,
  cardSummaries,
  alerts,
  drillTriggers,
  onStatsReady,
  onDrill,
  height = DEFAULT_HEIGHT,
}: LensCardProps) => {
  const { isDegenerate } = useLensCardLoader(card, cardSummaries, onStatsReady);
  const { isLoading: isMetadataLoading } = useGetAdhocQueryMetadataQuery(
    card.dataset_query,
  );
  const metadata = useSelector(getMetadata);
  const { data: dataset, isLoading: isDataLoading } = useGetAdhocQueryQuery(
    card.dataset_query,
  );

  const { displayType, displaySettings } = useMemo(() => {
    if (isMetadataLoading) {
      return { displayType: card.display, displaySettings: {} };
    }

    try {
      const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
      const { display, settings = {} } = defaultDisplay(query);
      const finalDisplay =
        display === "table" || display === "bar" ? card.display : display;
      return { displayType: finalDisplay, displaySettings: settings };
    } catch {
      return { displayType: card.display, displaySettings: {} };
    }
  }, [metadata, card, isMetadataLoading]);

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!dataset) {
      return;
    }
    const vizDisplay: CardDisplayType =
      displayType === "hidden" ? "table" : displayType;
    return [
      {
        card: createMockCard({
          name: card.title,
          display: vizDisplay,
          dataset_query: card.dataset_query,
          visualization_settings: {
            "graph.y_axis.labels_enabled": false,
            "graph.x_axis.labels_enabled": false,
            ...displaySettings,
            ...card.visualization_settings,
          },
        }),
        data: dataset.data,
      },
    ];
  }, [dataset, card, displayType, displaySettings]);

  if (isDegenerate || card.display === "hidden") {
    return null;
  }

  const isLoading = isMetadataLoading || isDataLoading;

  const cardAlerts = alerts.filter((a) => a.condition.card_id === card.id);
  const cardDrills = drillTriggers.filter(
    (d) => d.condition.card_id === card.id,
  );

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="sm">
        <Title order={5} lineClamp={1}>
          {card.title}
        </Title>

        {isLoading || !rawSeries ? (
          <Stack gap="sm" align="center" justify="center" h={height}>
            <Loader size="sm" />
          </Stack>
        ) : (
          <Box h={height}>
            <Visualization rawSeries={rawSeries} />
          </Box>
        )}

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
