import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TransformDisconnectedDatabaseBanner } from "../../components/TransformDisconnectedDatabaseBanner";
import { TransformHeader } from "../../components/TransformHeader";
import { useTransformWithPolling } from "../../hooks/use-transform-with-polling";

import { TransformSettingsSection } from "./TransformSettingsSection";

type TransformSettingsPageParams = {
  transformId: string;
};

export const TransformSettingsPage = () => {
  const params = useParams<TransformSettingsPageParams>();
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
      <TransformDisconnectedDatabaseBanner transform={transform} />
      <TransformSettingsSection transform={transform} readOnly={readOnly} />
    </PageContainer>
  );
};
