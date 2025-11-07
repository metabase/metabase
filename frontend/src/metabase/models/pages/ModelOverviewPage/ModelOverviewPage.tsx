import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";

import { CardOverview } from "../../components/CardOverview";
import { ModelHeader } from "../../components/ModelHeader";
import { useLoadCardWithMetadata } from "../../hooks/use-load-card-with-metadata";

type ModelOverviewPageParams = {
  cardId: string;
};

type ModelOverviewPageProps = {
  params: ModelOverviewPageParams;
};

export function ModelOverviewPage({ params }: ModelOverviewPageProps) {
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
      <ModelHeader card={card} />
      <CardOverview card={card} />
    </Flex>
  );
}
