import type { ReactNode } from "react";

import type { MetricPageParams } from "metabase/common/metrics/types";
import { MetricDependenciesPage } from "metabase/metrics/pages/MetricDependenciesPage";

import { DataStudioMetricBreadcrumbs } from "../../components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "../../urls";

interface DataStudioMetricDependenciesPageProps {
  params: MetricPageParams;
  children?: ReactNode;
}

export function DataStudioMetricDependenciesPage({
  params,
  children,
}: DataStudioMetricDependenciesPageProps) {
  return (
    <MetricDependenciesPage
      params={params}
      urls={dataStudioMetricUrls}
      showAppSwitcher
      showDataStudioLink={false}
      renderBreadcrumbs={(card) => <DataStudioMetricBreadcrumbs card={card} />}
    >
      {children}
    </MetricDependenciesPage>
  );
}
