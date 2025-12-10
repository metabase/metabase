import type { ReactNode } from "react";
import { useMemo } from "react";

import * as Urls from "metabase/lib/urls";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import type {
  ExistingSegmentLayoutConfig,
  NewSegmentLayoutConfig,
} from "../SegmentLayout";
import { ExistingSegmentLayout, NewSegmentLayout } from "../SegmentLayout";

type PublishedTableSegmentLayoutParams = {
  tableId: string;
  segmentId?: string;
};

type PublishedTableSegmentLayoutProps = {
  params: PublishedTableSegmentLayoutParams;
  children?: ReactNode;
};

export function PublishedTableSegmentLayout({
  params,
  children,
}: PublishedTableSegmentLayoutProps) {
  const tableId = Urls.extractEntityId(params.tableId);
  const segmentId = params.segmentId
    ? Urls.extractEntityId(params.segmentId)
    : undefined;

  const existingConfig = useMemo<ExistingSegmentLayoutConfig | null>(() => {
    if (tableId == null || segmentId == null) {
      return null;
    }
    return {
      segmentId,
      backUrl: Urls.dataStudioTableSegments(tableId),
      tabUrls: {
        definition: Urls.dataStudioPublishedTableSegment(tableId, segmentId),
        revisions: Urls.dataStudioPublishedTableSegmentRevisions(
          tableId,
          segmentId,
        ),
        dependencies: Urls.dataStudioPublishedTableSegmentDependencies(
          tableId,
          segmentId,
        ),
      },
      renderBreadcrumbs: (table, segment) => (
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      ),
    };
  }, [tableId, segmentId]);

  const newConfig = useMemo<NewSegmentLayoutConfig | null>(() => {
    if (tableId == null || segmentId != null) {
      return null;
    }
    return {
      tableId,
      getSuccessUrl: (segment) =>
        Urls.dataStudioPublishedTableSegment(tableId, segment.id),
      renderBreadcrumbs: (table) => (
        <PublishedTableSegmentBreadcrumbs table={table} />
      ),
    };
  }, [tableId, segmentId]);

  if (existingConfig) {
    return (
      <ExistingSegmentLayout config={existingConfig}>
        {children}
      </ExistingSegmentLayout>
    );
  }

  if (newConfig) {
    return <NewSegmentLayout config={newConfig}>{children}</NewSegmentLayout>;
  }

  return null;
}
