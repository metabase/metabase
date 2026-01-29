import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Card, Loader, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { defaultDisplay } from "metabase-lib/viz/display";
import type {
  RawSeries,
  TransformInspectComparisonCard,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

type ComparisonCardProps = {
  card: TransformInspectComparisonCard | undefined;
};

const VISUALIZATION_HEIGHT = 235;

export const ComparisonCard = ({ card }: ComparisonCardProps) => {
  const metadata = useSelector(getMetadata);
  const { data: dataset, isLoading } = useGetAdhocQueryQuery(
    card ? card.dataset_query : skipToken,
  );

  const { displayType, displaySettings } = useMemo(() => {
    if (!card) {
      return { displayType: "row" as const, displaySettings: {} };
    }

    try {
      const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
      const { display, settings = {} } = defaultDisplay(query);

      return {
        displayType: display,
        displaySettings: settings,
      };
    } catch (e) {
      console.error("Failed to determine display type:", e);
      return { displayType: "row" as const, displaySettings: {} };
    }
  }, [card, metadata]);

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!dataset || !card) {
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
          },
        }),
        data: dataset.data,
      },
    ];
  }, [dataset, card, displayType, displaySettings]);

  if (isLoading || !rawSeries) {
    return (
      <Card p="md" shadow="none" withBorder>
        <Stack
          gap="sm"
          align="center"
          justify="center"
          h={VISUALIZATION_HEIGHT}
        >
          <Loader size="sm" />
        </Stack>
      </Card>
    );
  }

  return (
    <Card p="md" shadow="none" withBorder>
      <Box h={VISUALIZATION_HEIGHT}>
        <Visualization rawSeries={rawSeries} />
      </Box>
    </Card>
  );
};
