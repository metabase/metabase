import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Center, Flex } from "metabase/ui";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";

import { ModelHeader } from "../../components/ModelHeader";

type ModelDependenciesPageParams = {
  cardId: string;
};

type ModelDependenciesPageProps = {
  params: ModelDependenciesPageParams;
  children?: ReactNode;
};

export function ModelDependenciesPage({
  params,
  children,
}: ModelDependenciesPageProps) {
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
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioModelDependencies(card.id),
          defaultEntry: { id: card.id, type: "card" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}
