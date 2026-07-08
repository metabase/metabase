import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type { MetricPageProps } from "metabase/common/metrics/types";
import { Box, Card } from "metabase/ui";

import { MetricActivityTimeline } from "../../components/MetricActivityTimeline";
import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

import S from "./MetricHistoryPage.module.css";

export function MetricHistoryPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  return (
    <MetricPageCard cardId={params.cardId}>
      {(card) => (
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
      )}
    </MetricPageCard>
  );
}
