import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { AboutSidebar } from "metabase/common/data-studio/components/AboutSidebar";
import { AboutHeader } from "metabase/common/data-studio/components/AboutSidebar/AboutHeader";
import { CardDescription } from "metabase/common/data-studio/components/AboutSidebar/CardDescription";
import { CardSourceSubSection } from "metabase/common/data-studio/components/AboutSidebar/CardSourceSubSection";
import { OverviewVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Card, Center, Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId, TableId } from "metabase-types/api";

import { DataAppQuestionHeader } from "../../components/DataAppQuestionHeader";
import { useRouteDataAppQuestion } from "../../hooks/use-route-data-app-question";

const CARD_SOURCE_URLS = {
  database: (databaseId: DatabaseId) => Urls.dataStudioData({ databaseId }),
  table: (_databaseId: DatabaseId, tableId: TableId) =>
    Urls.dataStudioTable(tableId),
};

export function DataAppQuestionPage() {
  const { app, card, isLoading, error } = useRouteDataAppQuestion();

  if (isLoading || error != null || app == null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-question-overview">
      <DataAppQuestionHeader app={app} card={card} />
      <Flex flex={1} gap="lg" mih={0}>
        <Card withBorder p={0} flex={1} mah={700}>
          <OverviewVisualization card={card} />
        </Card>
        <AboutSidebar flex="0 0 360px">
          <AboutHeader updatedAt={card.updated_at} />
          <CardDescription card={card} />
          <CardSourceSubSection card={card} urls={CARD_SOURCE_URLS} mt="xxl" />
        </AboutSidebar>
      </Flex>
    </PageContainer>
  );
}
