import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks";
import { MeasureDependenciesPage } from "../MeasureDependenciesPage";

type PublishedTableMeasureDependenciesPageParams = {
  tableId: string;
  measureId: string;
};

type PublishedTableMeasureDependenciesPageProps = {
  params: PublishedTableMeasureDependenciesPageParams;
  children?: ReactNode;
};

export function PublishedTableMeasureDependenciesPage({
  params,
  children,
}: PublishedTableMeasureDependenciesPageProps) {
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    usePublishedTableMeasurePage(params);

  if (isLoading || error || !measure || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <MeasureDependenciesPage
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    >
      {children}
    </MeasureDependenciesPage>
  );
}
