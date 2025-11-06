import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { SemanticEntityOverview } from "metabase/models/components/SemanticEntityOverview";
import { useLoadCardWithMetadata } from "metabase/models/hooks/use-load-card-with-metadata";
import { Center, Flex } from "metabase/ui";

import { MetricHeader } from "../../components/MetricHeader";

import S from "./MetricOverviewPage.module.css";

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
    <Flex direction="column" h="100%" bg="var(--mb-color-bg-light)">
      <MetricHeader card={card} className={S.header} />
      <SemanticEntityOverview card={card} />
    </Flex>
  );
}
