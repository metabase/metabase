import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadCardWithMetadata } from "metabase/data-studio/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";

import { MetricHeader } from "../../components/MetricHeader";

import { MetricVisualization } from "./MetricVisualization";

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
    <Flex direction="column" h="100%">
      <MetricHeader card={card} />
      <MetricVisualization card={card} />
    </Flex>
  );
}
