import type { ReactNode } from "react";
import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { NewSegmentPage } from "../NewSegmentPage";

type PublishedTableNewSegmentPageParams = {
  tableId: string;
};

type PublishedTableNewSegmentPageProps = {
  params: PublishedTableNewSegmentPageParams;
  route: Route;
  children?: ReactNode;
};

export function PublishedTableNewSegmentPage({
  params,
  route,
}: PublishedTableNewSegmentPageProps) {
  const tableId = Urls.extractEntityId(params.tableId);

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error || !table || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <NewSegmentPage
      route={route}
      table={table}
      breadcrumbs={<PublishedTableSegmentBreadcrumbs table={table} />}
      getSuccessUrl={(segment) =>
        Urls.dataStudioPublishedTableSegment(tableId, segment.id)
      }
    />
  );
}
