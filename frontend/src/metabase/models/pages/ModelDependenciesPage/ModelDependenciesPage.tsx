import type { ReactNode } from "react";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Center, Flex } from "metabase/ui";

import { ModelHeader } from "../../components/ModelHeader";

type ModelDependenciesPageParams = {
  modelId: string;
};

type ModelDependenciesPageProps = {
  params: ModelDependenciesPageParams;
  children?: ReactNode;
};

export function ModelDependenciesPage({
  params,
  children,
}: ModelDependenciesPageProps) {
  const modelId = Urls.extractEntityId(params.modelId);
  const {
    data: model,
    isLoading,
    error,
  } = useGetCardQuery(modelId != null ? { id: modelId } : skipToken);

  if (isLoading || error != null || model == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Flex direction="column" h="100%">
      <ModelHeader id={model.id} name={model.name} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioModelDependencies(model.id),
          defaultEntry: { id: model.id, type: "card" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}
