import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type {
  MetricPageParams,
  MetricPageProps,
} from "metabase/common/metrics/types";
import { useParams } from "metabase/router";

import { MetricDimensions } from "../../components/MetricDimensions";
import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

export function MetricDimensionsPage({
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  const { cardId } = useParams<MetricPageParams>();

  return (
    <MetricPageCard cardId={cardId}>
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
