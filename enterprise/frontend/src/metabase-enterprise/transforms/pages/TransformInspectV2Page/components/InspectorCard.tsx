import { useMemo } from "react";

import {
  useGetAdhocQueryMetadataQuery,
  useGetAdhocQueryQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Card, Loader, Stack, Text, Title } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { defaultDisplay } from "metabase-lib/viz/display";
import type { InspectorV2Card, RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

type InspectorCardProps = {
  card: InspectorV2Card;
  height?: number;
  showTitle?: boolean;
};

const DEFAULT_HEIGHT = 235;

export const InspectorCard = ({
  card,
  height = DEFAULT_HEIGHT,
  showTitle = true,
}: InspectorCardProps) => {
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
      return {
        displayType: card.display !== "hidden" ? card.display : display,
        displaySettings: settings,
      };
    } catch (e) {
      console.error("Failed to determine display type:", e);
      return { displayType: card.display, displaySettings: {} };
    }
  }, [card, metadata, isMetadataLoading]);

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!dataset) {
      return;
    }
    return [
      {
        card: createMockCard({
          name: card.title,
          display: displayType,
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

  const isLoading = isMetadataLoading || isDataLoading;

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="sm">
        {showTitle && (
          <Title order={5} lineClamp={1}>
            {card.title}
          </Title>
        )}
        {isLoading || !rawSeries ? (
          <Stack gap="sm" align="center" justify="center" h={height}>
            <Loader size="sm" />
          </Stack>
        ) : (
          <Box h={height}>
            <Visualization rawSeries={rawSeries} />
          </Box>
        )}
      </Stack>
    </Card>
  );
};

// Scalar variant for simple count displays
export const ScalarCard = ({ card }: { card: InspectorV2Card }) => {
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
