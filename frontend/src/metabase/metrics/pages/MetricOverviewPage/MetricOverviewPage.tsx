import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useGetMetricQuery } from "metabase/api/metric";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import { useDispatch } from "metabase/redux";
import { Center } from "metabase/ui";
import * as Urls from "metabase/utils/urls";

import { MetricDimensionGrid } from "../../components/MetricDimensionGrid";
import { MetricPageShell } from "../../components/MetricPageShell";
import type { MetricPageProps } from "../../types";
import { metricUrls as defaultUrls } from "../../urls";

export function MetricOverviewPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const dispatch = useDispatch();
  const {
    card,
    isLoading: isCardLoading,
    error,
  } = useLoadCardWithMetadata(cardId);
  const { data: metric, isLoading: isMetricLoading } = useGetMetricQuery(
    cardId!,
    { skip: cardId == null },
  );

  const isLoading = isCardLoading || isMetricLoading;
  const hasDimensions =
    metric?.dimensions != null && metric.dimensions.length > 0;

  useEffect(() => {
    if (!isLoading && card != null && !hasDimensions) {
      dispatch(replace(urls.about(card.id)));
    }
  }, [isLoading, card, hasDimensions, dispatch, urls]);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (!hasDimensions) {
    return null;
  }

  return (
    <PageContainer data-testid="metric-overview-page" gap="xl">
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
