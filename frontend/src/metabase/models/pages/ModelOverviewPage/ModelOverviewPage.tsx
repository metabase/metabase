import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadCardWithMetadata } from "metabase/data-studio/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";

import { ModelHeader } from "../../components/ModelHeader";

import { ModelVisualization } from "./ModelVisualization";

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
      <ModelVisualization card={card} />
    </Flex>
  );
}
