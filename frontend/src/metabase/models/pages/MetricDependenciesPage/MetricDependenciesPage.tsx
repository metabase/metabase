import type { ReactNode } from "react";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Center, Flex } from "metabase/ui";

import { MetricHeader } from "../../components/MetricHeader";

type MetricDependenciesPageParams = {
  metricId: string;
};

type MetricDependenciesPageProps = {
  params: MetricDependenciesPageParams;
  children?: ReactNode;
};

export function MetricDependenciesPage({
  params,
  children,
}: MetricDependenciesPageProps) {
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
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioMetricDependencies(metric.id),
          defaultEntry: { id: metric.id, type: "card" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}
