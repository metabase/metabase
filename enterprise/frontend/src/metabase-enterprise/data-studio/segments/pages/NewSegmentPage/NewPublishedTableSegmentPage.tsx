import type { Route } from "react-router";

import * as Urls from "metabase/lib/urls";
import type { Segment } from "metabase-types/api";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";

import { NewSegmentPage } from "./NewSegmentPage";

type NewPublishedTableSegmentPageParams = {
  tableId: string;
};

type NewPublishedTableSegmentPageProps = {
  params: NewPublishedTableSegmentPageParams;
  route: Route;
};

export function NewPublishedTableSegmentPage({
  params,
  route,
}: NewPublishedTableSegmentPageProps) {
  const tableId = Urls.extractEntityId(params.tableId);

  if (tableId == null) {
    return null;
  }

  return (
    <NewSegmentPage
      tableId={tableId}
      getSuccessUrl={(segment: Segment) =>
        Urls.dataStudioPublishedTableSegment(tableId, segment.id)
      }
      renderBreadcrumbs={(table) => (
        <PublishedTableSegmentBreadcrumbs table={table} />
      )}
      route={route}
    />
  );
}
