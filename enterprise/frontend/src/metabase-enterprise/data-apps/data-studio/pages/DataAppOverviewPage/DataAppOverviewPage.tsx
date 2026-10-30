import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Card, Center, Flex } from "metabase/ui";

import { DataAppView } from "../../../host/components/DataAppView/DataAppView";
import { DataAppHeader } from "../../components/DataAppHeader";
import { useRouteDataApp } from "../../hooks/use-route-data-app";

import { DataAppAboutSidebar } from "./DataAppAboutSidebar";

export function DataAppOverviewPage() {
  const { app, isLoading, error } = useRouteDataApp();

  if (isLoading || error != null || app == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-overview">
      <DataAppHeader app={app} />
      <Flex flex={1} gap="lg" mih={0}>
        <Card withBorder p="xl" flex={1} mah={700}>
          <DataAppView name={app.name} enableDrafts />
        </Card>
        <DataAppAboutSidebar app={app} />
      </Flex>
    </PageContainer>
  );
}
