import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { DataTestRuns } from "../../components/DataTestRuns";
import { SegmentTestHeader } from "../../components/SegmentTestHeader";
import { useRouteSegmentTest } from "../../hooks/use-route-segment-test";

export function SegmentTestRunsPage() {
  const { segment, table, test, urls, isLoading, error } =
    useRouteSegmentTest();

  if (
    segment == null ||
    table == null ||
    test == null ||
    urls == null ||
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
    <PageContainer data-testid="segment-test-runs">
      <SegmentTestHeader
        segment={segment}
        table={table}
        test={test}
        urls={urls}
      />
      <DataTestRuns testType="segment" testId={test.id} />
    </PageContainer>
  );
}
