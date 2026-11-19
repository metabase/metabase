import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataTestRun } from "../../components/DataTestRun";
import { SegmentTestHeader } from "../../components/SegmentTestHeader";
import { useRouteSegmentTest } from "../../hooks/use-route-segment-test";

type SegmentTestRunRouteParams = {
  runId: string;
};

export function SegmentTestRunPage() {
  const { segment, table, test, urls, isLoading, error } =
    useRouteSegmentTest();
  const params = useParams<SegmentTestRunRouteParams>();
  const runId = Urls.extractEntityId(params.runId);

  if (
    segment == null ||
    table == null ||
    test == null ||
    urls == null ||
    runId == null ||
    isLoading ||
    error != null
  ) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="segment-test-run">
      <SegmentTestHeader
        segment={segment}
        table={table}
        test={test}
        urls={urls}
      />
      <DataTestRun testType="segment" testId={test.id} runId={runId} />
    </PageContainer>
  );
}
