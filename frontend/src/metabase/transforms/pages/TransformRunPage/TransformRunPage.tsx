import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import * as Urls from "metabase/lib/urls";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { useTransformWithPolling } from "metabase/transforms/hooks/use-transform-with-polling";
import { Center } from "metabase/ui";

import { TransformHeader } from "../../components/TransformHeader";

import { RunSection } from "./RunSection";

type TransformRunPageParams = {
  transformId: string;
};

type TransformRunPageProps = {
  params: TransformRunPageParams;
};

export const TransformRunPage = ({ params }: TransformRunPageProps) => {
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

  if (isLoading || error || !transform) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-run-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <RunSection transform={transform} readOnly={readOnly} />
    </PageContainer>
  );
};
