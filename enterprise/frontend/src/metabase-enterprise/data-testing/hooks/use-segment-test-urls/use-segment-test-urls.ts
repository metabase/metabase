import { useMemo } from "react";

import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type { SegmentId, SegmentTestId } from "metabase-types/api";

type SegmentTestRouteParams = {
  databaseId?: string;
  schemaId?: string;
  tableId: string;
};

export type SegmentTestUrls = {
  location: "published-table" | "data-model";
  segmentListUrl: string;
  getSegmentUrl: (segmentId: SegmentId) => string;
  getTestListUrl: (segmentId: SegmentId) => string;
  getTestUrl: (segmentId: SegmentId, testId: SegmentTestId) => string;
  getTestRunsUrl: (
    segmentId: SegmentId,
    testId: SegmentTestId,
    params?: Urls.DataTestRunListParams,
  ) => string;
};

function getSegmentTestUrls({
  databaseId: databaseIdParam,
  schemaId,
  tableId: tableIdParam,
}: Partial<SegmentTestRouteParams>): SegmentTestUrls | null {
  const tableId = Urls.extractEntityId(tableIdParam);
  if (tableId == null) {
    return null;
  }

  if (databaseIdParam == null) {
    return {
      location: "published-table",
      segmentListUrl: Urls.dataStudioTableSegments(tableId),
      getSegmentUrl: (segmentId) =>
        Urls.dataStudioPublishedTableSegment(tableId, segmentId),
      getTestListUrl: (segmentId) =>
        Urls.dataStudioPublishedTableSegmentTestList(tableId, segmentId),
      getTestUrl: (segmentId, testId) =>
        Urls.dataStudioPublishedTableSegmentTest(tableId, segmentId, testId),
      getTestRunsUrl: (segmentId, testId, params) =>
        Urls.dataStudioPublishedTableSegmentTestRuns(
          tableId,
          segmentId,
          testId,
          params,
        ),
    };
  }

  const databaseId = Urls.extractEntityId(databaseIdParam);
  if (databaseId == null) {
    return null;
  }
  const tableParams = {
    databaseId,
    schemaName: getSchemaName(schemaId),
    tableId,
  };

  return {
    location: "data-model",
    segmentListUrl: Urls.dataStudioData({ ...tableParams, tab: "segments" }),
    getSegmentUrl: (segmentId) =>
      Urls.dataStudioDataModelSegment({ ...tableParams, segmentId }),
    getTestListUrl: (segmentId) =>
      Urls.dataStudioDataModelSegmentTestList({ ...tableParams, segmentId }),
    getTestUrl: (segmentId, testId) =>
      Urls.dataStudioDataModelSegmentTest(
        { ...tableParams, segmentId },
        testId,
      ),
    getTestRunsUrl: (segmentId, testId, params) =>
      Urls.dataStudioDataModelSegmentTestRuns(
        { ...tableParams, segmentId },
        testId,
        params,
      ),
  };
}

export function useSegmentTestUrls(): SegmentTestUrls | null {
  const { databaseId, schemaId, tableId } = useParams<SegmentTestRouteParams>();

  return useMemo(
    () => getSegmentTestUrls({ databaseId, schemaId, tableId }),
    [databaseId, schemaId, tableId],
  );
}
