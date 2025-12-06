import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";

import { MetricHeader } from "../../components/MetricHeader";

import { MetricOverview } from "./MetricOverview";

type MetricOverviewPageParams = {
  cardId: string;
};

type MetricOverviewPageProps = {
  params: MetricOverviewPageParams;
};

export function MetricOverviewPage({ params }: MetricOverviewPageProps) {
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
    <Flex direction="column" h="100%" data-testid="metric-overview-page">
      <MetricHeader card={card} />
      <MetricOverview card={card} />
    </Flex>
  );
}
