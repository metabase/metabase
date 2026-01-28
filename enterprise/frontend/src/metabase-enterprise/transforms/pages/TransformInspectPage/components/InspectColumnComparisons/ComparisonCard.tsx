import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { Box, Card, Loader, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
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
  const { data: dataset, isLoading } = useGetAdhocQueryQuery(
    card ? card.dataset_query : skipToken,
  );

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!dataset || !card) {
      return;
    }
    return [
      {
        card: createMockCard({
          name: card.title,
          display: card.display,
          dataset_query: card.dataset_query,
          visualization_settings: {
            "graph.y_axis.labels_enabled": false,
            "graph.x_axis.labels_enabled": false,
          },
        }),
        data: dataset.data,
      },
    ];
  }, [dataset, card]);

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
