import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { Box, Card, Loader, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  RawSeries,
  TransformInspectComparisonCard,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

type ComparisonCardProps = {
  card: TransformInspectComparisonCard | undefined;
};

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
