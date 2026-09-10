import { memo, useMemo } from "react";

import { useGetAdhocQueryMetadataQuery } from "metabase/api";
import { useSnapshotSelector } from "metabase/common/hooks";
import { getMetadata } from "metabase/metadata-store";
import { Box, Card, Loader, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import {
  type VizHint,
  type VizInput,
  useResolvedDisplay,
} from "metabase/visualizations/lib/viz-heuristics";
import * as Lib from "metabase-lib";
import { defaultDisplay } from "metabase-lib/query/display";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  CardDisplayType,
  Dataset,
  DatasetColumn,
  InspectorCard,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { useLensCardLoader } from "../../../../hooks";
import { CardAlerts } from "../../../CardAlerts";
import { CardDrills } from "../../../CardDrills";
import { useLensContentContext } from "../../../LensContent/LensContentContext";

type VisualizationCardProps = {
  card: InspectorCard;
  height?: number;
};

const DEFAULT_HEIGHT = 235;
const EMPTY_COLUMNS: DatasetColumn[] = [];

export const VisualizationCard = memo(
  ({ card, height = DEFAULT_HEIGHT }: VisualizationCardProps) => {
    const { alertsByCardId, drillLensesByCardId } = useLensContentContext();
    const { data, isLoading: isDataLoading } = useLensCardLoader({ card });

    const { isLoading: isMetadataLoading } = useGetAdhocQueryMetadataQuery(
      card.dataset_query,
    );

    const metadata = useSnapshotSelector(getMetadata, [isMetadataLoading]);

    const query = useMemo(
      () => getLensQuery(metadata, card, isMetadataLoading),
      [metadata, card, isMetadataLoading],
    );
    const hint = useMemo(() => getDisplayConfig(query, card), [query, card]);
    const vizInput = useMemo<VizInput>(
      () => ({
        cols: data?.data.cols ?? EMPTY_COLUMNS,
        rows: data?.data.rows,
        query,
        hint,
        context: "lens",
      }),
      [data, query, hint],
    );
    const { display: displayType, settings: displaySettings = {} } =
      useResolvedDisplay(card.id, vizInput, card.title);

    if (card.display === "hidden") {
      return null;
    }

    const alerts = alertsByCardId[card.id] ?? [];
    const drillLenses = drillLensesByCardId[card.id] ?? [];

    const rawSeries = buildRawSeries(data, card, displayType, displaySettings);
    const isLoading = isMetadataLoading || isDataLoading;

    const questionUrl = rawSeries?.[0]?.card
      ? Urls.serializedQuestion(rawSeries[0].card)
      : undefined;

    const getHref = questionUrl ? () => questionUrl : undefined;

    const onChangeCardAndRun = questionUrl
      ? () => Urls.openInNewTab(questionUrl)
      : undefined;

    return (
      <Card p="lg" shadow="none" withBorder>
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
                isDashboard={true}
                getHref={getHref}
                onChangeCardAndRun={onChangeCardAndRun}
              />
            </Box>
          )}

          <CardAlerts alerts={alerts} />

          <CardDrills drillLenses={drillLenses} />
        </Stack>
      </Card>
    );
  },
);

VisualizationCard.displayName = "VisualizationCard";

const getLensQuery = (
  metadata: Metadata,
  card: InspectorCard,
  isMetadataLoading: boolean,
): Lib.Query | null => {
  if (isMetadataLoading) {
    return null;
  }
  try {
    return Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  } catch {
    return null;
  }
};

/** The lens's own pick: the backend display unless the query clearly wants a map/line/etc. */
const getDisplayConfig = (
  query: Lib.Query | null,
  card: InspectorCard,
): VizHint => {
  const cardDisplay: CardDisplayType =
    card.display === "hidden" ? "table" : card.display;
  if (!query) {
    return { display: cardDisplay, settings: {} };
  }

  try {
    const { display, settings = {} } = defaultDisplay(query);
    const finalDisplay =
      display === "table" || display === "bar" ? cardDisplay : display;
    return { display: finalDisplay, settings };
  } catch {
    return { display: cardDisplay, settings: {} };
  }
};

const buildRawSeries = (
  dataset: Dataset | undefined,
  card: InspectorCard,
  displayType: CardDisplayType,
  displaySettings: Partial<VisualizationSettings>,
): RawSeries | undefined => {
  if (!dataset) {
    return;
  }

  return [
    {
      card: createMockCard({
        name: card.title,
        display: displayType,
        displayIsLocked: true,
        dataset_query: card.dataset_query,
        visualization_settings: {
          "graph.y_axis.labels_enabled": false,
          "graph.x_axis.labels_enabled": false,
          "table.row_index": false,
          ...displaySettings,
          ...card.visualization_settings,
        },
      }),
      data: dataset.data,
    },
  ];
};
