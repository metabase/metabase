import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";

import { ModelHeader } from "../../components/ModelHeader";
import { SemanticEntityOverview } from "../../components/SemanticEntityOverview";
import { useLoadCardWithMetadata } from "../../hooks/use-load-card-with-metadata";

import S from "./ModelOverviewPage.module.css";

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
    <Flex direction="column" h="100%" bg="var(--mb-color-bg-light)">
      <ModelHeader card={card} className={S.header} />
      <SemanticEntityOverview card={card} />
    </Flex>
  );
}
