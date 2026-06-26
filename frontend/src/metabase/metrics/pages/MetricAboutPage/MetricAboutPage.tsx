import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type { MetricPageProps } from "metabase/common/metrics/types";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

import { MetricAbout } from "./MetricAbout";

export function MetricAboutPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  return (
    <MetricPageCard cardId={params.cardId}>
      {(card) => (
        <PageContainer data-testid="metric-about-page" gap="xl">
          <MetricPageShell
            card={card}
            urls={urls}
            renderBreadcrumbs={renderBreadcrumbs}
            showAppSwitcher={showAppSwitcher}
            showDataStudioLink={showDataStudioLink}
          />
          <MetricAbout card={card} urls={urls} />
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
