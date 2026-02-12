import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks";
import { SegmentDependenciesPage } from "../SegmentDependenciesPage";

type PublishedTableSegmentDependenciesPageParams = {
  tableId: string;
  segmentId: string;
};

type PublishedTableSegmentDependenciesPageProps = {
  params: PublishedTableSegmentDependenciesPageParams;
  children?: ReactNode;
};

export function PublishedTableSegmentDependenciesPage({
  params,
  children,
}: PublishedTableSegmentDependenciesPageProps) {
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    usePublishedTableSegmentPage(params);

  if (isLoading || error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentDependenciesPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    >
      {children}
    </SegmentDependenciesPage>
  );
}
