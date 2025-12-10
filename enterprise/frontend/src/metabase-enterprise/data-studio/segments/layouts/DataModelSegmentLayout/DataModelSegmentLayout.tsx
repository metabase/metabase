import type { ReactNode } from "react";
import { useMemo } from "react";

import * as Urls from "metabase/lib/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import type {
  ExistingSegmentLayoutConfig,
  NewSegmentLayoutConfig,
} from "../SegmentLayout";
import { ExistingSegmentLayout, NewSegmentLayout } from "../SegmentLayout";

type DataModelSegmentLayoutParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId?: string;
};

type DataModelSegmentLayoutProps = {
  params: DataModelSegmentLayoutParams;
  children?: ReactNode;
};

export function DataModelSegmentLayout({
  params,
  children,
}: DataModelSegmentLayoutProps) {
  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);
  const segmentId = params.segmentId
    ? Urls.extractEntityId(params.segmentId)
    : undefined;

  const existingConfig = useMemo<ExistingSegmentLayoutConfig | null>(() => {
    if (tableId == null || schemaName == null || segmentId == null) {
      return null;
    }
    const urlParams = { databaseId, schemaName, tableId, segmentId };
    return {
      segmentId,
      backUrl: Urls.dataStudioData({
        databaseId,
        schemaName,
        tableId,
        tab: "segments",
      }),
      tabUrls: {
        definition: Urls.dataStudioDataModelSegment(urlParams),
        revisions: Urls.dataStudioDataModelSegmentRevisions(urlParams),
        dependencies: Urls.dataStudioDataModelSegmentDependencies(urlParams),
      },
      renderBreadcrumbs: (table, segment) => (
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      ),
    };
  }, [databaseId, schemaName, tableId, segmentId]);

  const newConfig = useMemo<NewSegmentLayoutConfig | null>(() => {
    if (tableId == null || schemaName == null || segmentId != null) {
      return null;
    }
    return {
      tableId,
      getSuccessUrl: (segment) =>
        Urls.dataStudioDataModelSegment({
          databaseId,
          schemaName,
          tableId,
          segmentId: segment.id,
        }),
      renderBreadcrumbs: (table) => (
        <DataModelSegmentBreadcrumbs table={table} />
      ),
    };
  }, [databaseId, schemaName, tableId, segmentId]);

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
