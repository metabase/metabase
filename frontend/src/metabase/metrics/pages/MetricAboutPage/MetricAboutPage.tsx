import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type {
  MetricPageParams,
  MetricPageProps,
} from "metabase/common/metrics/types";
import { useParams } from "metabase/router";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

import { MetricAbout } from "./MetricAbout";

export function MetricAboutPage({
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  const { cardId } = useParams<MetricPageParams>();

  return (
    <MetricPageCard cardId={cardId}>
      {(card, metadata) => (
        <PageContainer data-testid="metric-about-page" gap="xxl">
          <MetricPageShell
            card={card}
            urls={urls}
            renderBreadcrumbs={renderBreadcrumbs}
            showAppSwitcher={showAppSwitcher}
            showDataStudioLink={showDataStudioLink}
          />
          <MetricAbout card={card} metadata={metadata} urls={urls} />
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
