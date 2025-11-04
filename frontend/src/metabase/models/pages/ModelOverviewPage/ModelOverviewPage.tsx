import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Box } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";

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
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <ModelOverviewPageBody model={model} />;
}

type ModelOverviewPageBodyProps = {
  model: Card;
};

function ModelOverviewPageBody({ model }: ModelOverviewPageBodyProps) {
  return (
    <Box h="100%">
      <ModelHeader id={model.id} name={model.name} />
    </Box>
  );
}
