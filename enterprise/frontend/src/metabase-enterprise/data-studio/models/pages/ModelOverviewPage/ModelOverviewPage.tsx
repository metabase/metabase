import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";

import { CardOverview } from "../../../common/components/CardOverview";
import { ModelHeader } from "../../components/ModelHeader";

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
    <Flex direction="column" h="100%" data-testid="model-overview-page">
      <ModelHeader card={card} />
      <CardOverview card={card} />
    </Flex>
  );
}
