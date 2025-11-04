import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";

import { ModelVisualization } from "./ModelVisualization";

type ModelOverviewPageParams = {
  modelId: string;
};

type ModelOverviewPageProps = {
  params: ModelOverviewPageParams;
};

export function ModelOverviewPage({ params }: ModelOverviewPageProps) {
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

  return <ModelOverviewPageBody model={model} />;
}

type ModelOverviewPageBodyProps = {
  model: Card;
};

function ModelOverviewPageBody({ model }: ModelOverviewPageBodyProps) {
  return (
    <Flex direction="column" h="100%">
      <ModelHeader id={model.id} name={model.name} />
      <ModelVisualization model={model} />
    </Flex>
  );
}
