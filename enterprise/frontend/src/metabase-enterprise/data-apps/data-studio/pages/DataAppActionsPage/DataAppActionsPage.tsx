import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataAppHeader } from "../../components/DataAppHeader";
import { DataAppItemList } from "../../components/DataAppItemList";
import { useRouteDataApp } from "../../hooks/use-route-data-app";

export function DataAppActionsPage() {
  const { app, isLoading, error } = useRouteDataApp();

  if (isLoading || error != null || app == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-actions" gap="lg">
      <DataAppHeader app={app} />
      <DataAppItemList
        app={app}
        model="action"
        emptyMessage={t`No actions yet`}
        getItemUrl={(actionId) =>
          Urls.dataStudioDataAppAction(app.name, actionId)
        }
      />
    </PageContainer>
  );
}
