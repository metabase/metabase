import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TransformHeader } from "../../components/TransformHeader";
import { useTransformWithPolling } from "../../hooks/use-transform-with-polling";

import { JevClassifySection } from "./JevClassifySection";

type TransformClassifyPageParams = {
  transformId: string;
};

export const TransformClassifyPage = () => {
  const params = useParams<TransformClassifyPageParams>();
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useTransformWithPolling(transformId);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-classify-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <JevClassifySection transform={transform} readOnly={readOnly} />
    </PageContainer>
  );
};
