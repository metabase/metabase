import { skipToken, useGetSegmentQuery } from "metabase/api";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useGetSegmentTestQuery } from "metabase-enterprise/api";

import { useSegmentTestUrls } from "../use-segment-test-urls";

type SegmentTestRouteParams = {
  segmentId: string;
  testId: string;
};

export function useRouteSegmentTest() {
  const params = useParams<SegmentTestRouteParams>();
  const segmentId = Urls.extractEntityId(params.segmentId);
  const testId = Urls.extractEntityId(params.testId);
  const urls = useSegmentTestUrls();
  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId ?? skipToken);
  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(segment?.table_id);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = useGetSegmentTestQuery(testId ?? skipToken);

  return {
    segment,
    table,
    test,
    urls,
    isLoading: isLoadingSegment || isLoadingTable || isLoadingTest,
    error: segmentError ?? tableError ?? testError,
  };
}
