import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";

import { MetricPageShell } from "../../components/MetricPageShell";
import type { MetricPageProps } from "../../types";
import { metricUrls as defaultUrls } from "../../urls";

import { MetricOverview } from "./MetricOverview";

export function MetricOverviewPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
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
    <PageContainer data-testid="metric-overview-page" gap="xl">
      <MetricPageShell
        card={card}
        urls={urls}
        renderBreadcrumbs={renderBreadcrumbs}
        showAppSwitcher={showAppSwitcher}
      />
      <MetricOverview card={card} urls={urls} />
    </PageContainer>
  );
}
