import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import * as Urls from "metabase/lib/urls";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center } from "metabase/ui";

import { TransformHeader } from "../../components/TransformHeader";
import { useTransformWithPolling } from "../../hooks/use-transform-with-polling";

import { TransformSettingsSection } from "./TransformSettingsSection";

type TransformSettingsPageParams = {
  transformId: string;
};

type TransformTargetPageProps = {
  params: TransformSettingsPageParams;
};

export const TransformSettingsPage = ({ params }: TransformTargetPageProps) => {
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
    <PageContainer data-testid="transforms-target-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <TransformSettingsSection transform={transform} readOnly={readOnly} />
    </PageContainer>
  );
};
