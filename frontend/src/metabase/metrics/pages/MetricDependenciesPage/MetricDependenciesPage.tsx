import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type { MetricPageProps } from "metabase/common/metrics/types";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card } from "metabase/ui";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

export function MetricDependenciesPage({
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
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: urls.dependencies(card.id),
              defaultEntry: { id: card.id, type: "card" },
            }}
          >
            <Card withBorder p={0} flex={1}>
              <Outlet />
            </Card>
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
