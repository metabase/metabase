import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type { MetricPageProps } from "metabase/common/metrics/types";

import { MetricDimensions } from "../../components/MetricDimensions";
import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

export function MetricDimensionsPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  return (
    <MetricPageCard cardId={params.cardId}>
      {(card, metadata) => (
        <PageContainer data-testid="metric-dimensions-page" gap="xl">
          <MetricPageShell
            card={card}
            urls={urls}
            renderBreadcrumbs={renderBreadcrumbs}
            showAppSwitcher={showAppSwitcher}
            showDataStudioLink={showDataStudioLink}
          />
          <MetricDimensions metricId={card.id} queryMetadata={metadata} />
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
