import { Link } from "react-router";

import { useGetAdhocQueryMetadataQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Card, Icon, Loader, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import { defaultDisplay } from "metabase-lib/viz/display";
import type {
  CardDisplayType,
  Dataset,
  InspectorCard,
  RawSeries,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { useLensCardLoader } from "../../../../hooks";
import type { LensRef } from "../../../../types";
import { CardAlerts } from "../../../CardAlerts";
import { CardDrills } from "../../../CardDrills";

type VisualizationCardProps = {
  lensId: string;
  card: InspectorCard;
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lensRef: LensRef) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 235;

export const VisualizationCard = ({
  lensId,
  card,
  alerts,
  drillLenses,
  onStatsReady,
  onDrill,
  height = DEFAULT_HEIGHT,
}: VisualizationCardProps) => {
  const { data, isLoading: isDataLoading } = useLensCardLoader({
    lensId,
    card,
    onStatsReady,
  });

  const { isLoading: isMetadataLoading } = useGetAdhocQueryMetadataQuery(
    card.dataset_query,
  );
  const metadata = useSelector(getMetadata);

  if (card.display === "hidden") {
    return null;
  }

  const { displayType, displaySettings } = getDisplayConfig(
    metadata,
    card,
    isMetadataLoading,
  );

  const rawSeries = buildRawSeries(data, card, displayType, displaySettings);
  const isLoading = isMetadataLoading || isDataLoading;

  const questionUrl = rawSeries?.[0]?.card
    ? Urls.serializedQuestion(rawSeries[0].card)
    : undefined;

  const getHref = questionUrl ? () => questionUrl : undefined;

  const onChangeCardAndRun = questionUrl
    ? () => window.open(questionUrl, "_blank")
    : undefined;

  const actionButtons = questionUrl ? (
    <Link to={questionUrl} target="_blank">
      <Icon name="external" />
    </Link>
  ) : null;

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="sm">
        {isLoading || !rawSeries ? (
          <Stack gap="sm" align="center" justify="center" h={height}>
            <Loader size="sm" />
          </Stack>
        ) : (
          <Box h={height}>
            <Visualization
              rawSeries={rawSeries}
              showTitle={true}
              actionButtons={actionButtons}
              getHref={getHref}
              onChangeCardAndRun={onChangeCardAndRun}
            />
          </Box>
        )}

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

function getDisplayConfig(
  metadata: ReturnType<typeof getMetadata>,
  card: InspectorCard,
  isMetadataLoading: boolean,
) {
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
}

function buildRawSeries(
  dataset: Dataset | undefined,
  card: InspectorCard,
  displayType: string,
  displaySettings: Record<string, unknown>,
): RawSeries | undefined {
  if (!dataset) {
    return;
  }
  const vizDisplay: CardDisplayType =
    displayType === "hidden" ? "table" : (displayType as CardDisplayType);
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
}
