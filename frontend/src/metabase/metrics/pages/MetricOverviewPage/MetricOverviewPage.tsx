import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);

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
