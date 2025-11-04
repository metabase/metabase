import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";

type ModelQueryPageParams = {
  modelId: string;
};

type ModelQueryPageProps = {
  params: ModelQueryPageParams;
};

export function ModelQueryPage({ params }: ModelQueryPageProps) {
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

  return <ModelQueryPageBody model={model} />;
}

type ModelQueryPageBodyProps = {
  model: Card;
};

function ModelQueryPageBody({ model }: ModelQueryPageBodyProps) {
  return (
    <Flex direction="column" h="100%">
      <ModelHeader id={model.id} name={model.name} />
    </Flex>
  );
}
