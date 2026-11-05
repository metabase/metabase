import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataAppHeader } from "../../components/DataAppHeader";
import { DataAppItemList } from "../../components/DataAppItemList";
import { useRouteDataApp } from "../../hooks/use-route-data-app";

export function DataAppQuestionsPage() {
  const { app, isLoading, error } = useRouteDataApp();

  if (isLoading || error != null || app == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-questions" gap="lg">
      <DataAppHeader app={app} />
      <DataAppItemList
        app={app}
        model="card"
        emptyMessage={t`No questions yet`}
        getItemUrl={(cardId) =>
          Urls.dataStudioDataAppQuestion(app.name, cardId)
        }
      />
    </PageContainer>
  );
}
