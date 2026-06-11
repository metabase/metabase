import { PageContainer } from "metabase/data-studio/common/components/PageContainer";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import type { MetricPageProps } from "../../types";
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
