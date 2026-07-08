import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useGetMetricQuery } from "metabase/api/metric";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type {
  MetricPageProps,
  MetricUrls,
} from "metabase/common/metrics/types";
import { useDispatch } from "metabase/redux";
import { Center } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { MetricDimensionGrid } from "../../components/MetricDimensionGrid";
import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

export function MetricOverviewPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  return (
    <MetricPageCard cardId={params.cardId}>
      {(card) => (
        <MetricOverviewPageBody
          card={card}
          urls={urls}
          renderBreadcrumbs={renderBreadcrumbs}
          showAppSwitcher={showAppSwitcher}
          showDataStudioLink={showDataStudioLink}
        />
      )}
    </MetricPageCard>
  );
}

interface MetricOverviewPageBodyProps extends Omit<MetricPageProps, "params"> {
  card: Card;
  urls: MetricUrls;
}

function MetricOverviewPageBody({
  card,
  urls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink,
}: MetricOverviewPageBodyProps) {
  const dispatch = useDispatch();
  const { data: metric, isLoading: isMetricLoading } = useGetMetricQuery(
    card.id,
  );
  const hasDimensions =
    metric?.dimensions != null && metric.dimensions.length > 0;

  useEffect(() => {
    if (!isMetricLoading && !hasDimensions) {
      dispatch(replace(urls.about(card.id)));
    }
  }, [card.id, isMetricLoading, hasDimensions, dispatch, urls]);

  if (isMetricLoading) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
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
      <MetricDimensionGrid metricId={card.id} />
    </PageContainer>
  );
}
