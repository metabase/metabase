import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetSegmentQuery, useGetTableQuery } from "metabase/api";
import { useListDatabasesQuery } from "metabase/api/database";
import { hasNativeWritePermissions } from "metabase/common/utils/database";
import {
  useGetSegmentTestQuery,
  useListSegmentTestsQuery,
  useRunSegmentTestMutation,
} from "metabase-enterprise/api";
import type { SegmentId, SegmentTest } from "metabase-types/api";

import { useSegmentTestUrls } from "../../hooks/use-segment-test-urls";
import type {
  DataTestReadOnlyResult,
  DataTestTypeDefinition,
  DataTestUrls,
} from "../../types";

import { SegmentLink } from "./SegmentLink";
import { SegmentTestDefinition } from "./SegmentTestDefinition";

function useListSegmentTestsBySubjectQuery(
  segmentId: SegmentId | typeof skipToken,
) {
  return useListSegmentTestsQuery(
    segmentId === skipToken ? skipToken : { "segment-id": segmentId },
  );
}

function useSegmentReadOnly(
  segmentId: SegmentId | typeof skipToken,
): DataTestReadOnlyResult {
  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId);
  const {
    data: table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useGetTableQuery(segment != null ? { id: segment.table_id } : skipToken);
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();
  const database = databases?.data.find(
    (database) => database.id === table?.db_id,
  );

  return {
    readOnly: database == null || !hasNativeWritePermissions(database),
    isLoading: isLoadingSegment || isLoadingTable || isLoadingDatabases,
    error: segmentError ?? tableError ?? databasesError,
  };
}

const UNROUTED_SEGMENT_TEST_URLS: DataTestUrls<SegmentTest> = {
  getTestUrl: () => "",
  getTestRunsUrl: () => "",
};

function useSegmentTestUrlsByTest(): DataTestUrls<SegmentTest> {
  const urls = useSegmentTestUrls();

  return useMemo(() => {
    if (urls == null) {
      return UNROUTED_SEGMENT_TEST_URLS;
    }
    return {
      getTestUrl: (test) => urls.getTestUrl(test.segment_id, test.id),
      getTestRunsUrl: (test, params) =>
        urls.getTestRunsUrl(test.segment_id, test.id, params),
    };
  }, [urls]);
}

export const segmentTestDefinition: DataTestTypeDefinition<SegmentTest> = {
  useGetTestQuery: useGetSegmentTestQuery,
  useListTestsQuery: useListSegmentTestsBySubjectQuery,
  useRunTestMutation: useRunSegmentTestMutation,
  useReadOnly: useSegmentReadOnly,
  getSubjectId: (test) => test.segment_id,
  useTestUrls: useSegmentTestUrlsByTest,
  testType: "segment",
  getListLabel: () => t`Tests`,
  getRunDescription: () =>
    t`Runs the segment on the test data and checks the rows it matches. The real tables aren't touched.`,
  SubjectLink: SegmentLink,
  TestDefinition: SegmentTestDefinition,
};
