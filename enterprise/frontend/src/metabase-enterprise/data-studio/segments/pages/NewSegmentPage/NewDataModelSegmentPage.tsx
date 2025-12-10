import type { Location } from "history";
import type { Route } from "react-router";

import * as Urls from "metabase/lib/urls";
import type { Segment } from "metabase-types/api";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";

import { NewSegmentPage } from "./NewSegmentPage";

type NewDataModelSegmentPageProps = {
  location: Location;
  route: Route;
};

export function NewDataModelSegmentPage({
  location,
  route,
}: NewDataModelSegmentPageProps) {
  const tableIdParam = new URLSearchParams(location.search).get("tableId");
  const tableId = tableIdParam ? Number(tableIdParam) : null;

  if (tableId == null) {
    return null;
  }

  return (
    <NewSegmentPage
      tableId={tableId}
      getSuccessUrl={(segment: Segment) => Urls.dataStudioSegment(segment.id)}
      renderBreadcrumbs={(table) => (
        <DataModelSegmentBreadcrumbs table={table} />
      )}
      route={route}
    />
  );
}
