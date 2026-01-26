import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { Box, Card, Loader, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  CardDisplayType,
  Card as CardType,
  DatasetQuery,
  RawSeries,
  TransformInspectComparisonCard,
} from "metabase-types/api";

type ComparisonCardProps = {
  card: TransformInspectComparisonCard | undefined;
};

const createVisualizationCard = (props: {
  name: string;
  display: CardDisplayType;
  datasetQuery: DatasetQuery;
}): CardType => ({
  id: 0,
  name: props.name,
  type: "question",
  dashboard: null,
  dashboard_id: null,
  dashboard_count: null,
  result_metadata: null,
  last_query_start: null,
  average_query_time: null,
  cache_ttl: null,
  archived: false,
  display: props.display,
  dataset_query: props.datasetQuery,
  visualization_settings: {},
});

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
        card: createVisualizationCard({
          name: card.title,
          display: card.display,
          datasetQuery: card.dataset_query,
        }),
        data: dataset.data,
      },
    ];
  }, [dataset, card]);

  if (!card) {
    return <Box />;
  }

  if (isLoading || !rawSeries) {
    return (
      <Card p="md" shadow="none" withBorder>
        <Stack gap="sm" align="center" justify="center" h={200}>
          <Loader size="sm" />
        </Stack>
      </Card>
    );
  }

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="sm">
        <Text fw={600} size="sm">
          {card.title}
        </Text>
        <Box h={200}>
          <Visualization rawSeries={rawSeries} showTitle={false} />
        </Box>
      </Stack>
    </Card>
  );
};
