import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { MetricDimensionGrid } from "metabase/metrics/components/MetricDimensionGrid";
import { Center } from "metabase/ui";

import { MetricHeader } from "../../components/MetricHeader";

type MetricDimensionGridPageParams = {
  cardId: string;
};

type MetricDimensionGridPageProps = {
  params: MetricDimensionGridPageParams;
};

export function MetricDimensionGridPage({
  params,
}: MetricDimensionGridPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="metric-dimension-grid-page" gap="xl">
      <MetricHeader card={card} />
      {card.id != null && <MetricDimensionGrid metricId={card.id} />}
    </PageContainer>
  );
}
