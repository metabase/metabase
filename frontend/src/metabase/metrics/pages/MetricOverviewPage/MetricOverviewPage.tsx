import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";

import { MetricHeader } from "../../components/MetricHeader";

import { MetricVisualization } from "./MetricVisualization";

type MetricOverviewPageParams = {
  metricId: string;
};

type MetricOverviewPageProps = {
  params: MetricOverviewPageParams;
};

export function MetricOverviewPage({ params }: MetricOverviewPageProps) {
  const metricId = Urls.extractEntityId(params.metricId);
  const {
    data: metric,
    isLoading,
    error,
  } = useGetCardQuery(metricId != null ? { id: metricId } : skipToken);

  if (isLoading || error != null || metric == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Flex direction="column" h="100%">
      <MetricHeader id={metric.id} name={metric.name} />
      <MetricVisualization metric={metric} />
    </Flex>
  );
}
