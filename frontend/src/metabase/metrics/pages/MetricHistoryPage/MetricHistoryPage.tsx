import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Box, Card, Center } from "metabase/ui";

import { MetricActivityTimeline } from "../../components/MetricActivityTimeline";
import { MetricPageShell } from "../../components/MetricPageShell";
import type { MetricPageProps } from "../../types";
import { metricUrls as defaultUrls } from "../../urls";

import S from "./MetricHistoryPage.module.css";

export function MetricHistoryPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer>
      <MetricPageShell
        card={card}
        urls={urls}
        renderBreadcrumbs={renderBreadcrumbs}
        showAppSwitcher={showAppSwitcher}
        showDataStudioLink={showDataStudioLink}
      />
      <Card withBorder p="md" flex={1} className={S.card}>
        <Box maw={800} pt="md" px="md">
          <MetricActivityTimeline card={card} />
        </Box>
      </Card>
    </PageContainer>
  );
}
