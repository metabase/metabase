import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { MetricDimensionGrid } from "../../components/MetricDimensionGrid";
import { MetricPageShell } from "../../components/MetricPageShell";
import type { MetricUrls } from "../../types";
import { metricUrls as defaultUrls } from "../../urls";

type MetricDimensionGridPageProps = {
  params: { cardId: string };
  urls?: MetricUrls;
  renderBreadcrumbs?: (card: Card) => ReactNode;
  showAppSwitcher?: boolean;
  showDataStudioLink?: boolean;
};

export function MetricDimensionGridPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricDimensionGridPageProps) {
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
    <PageContainer data-testid="metric-dimension-grid-page" gap="xl">
      <MetricPageShell
        card={card}
        urls={urls}
        renderBreadcrumbs={renderBreadcrumbs}
        showAppSwitcher={showAppSwitcher}
        showDataStudioLink={showDataStudioLink}
      />
      {card.id != null && <MetricDimensionGrid metricId={card.id} />}
    </PageContainer>
  );
}
