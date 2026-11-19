import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { DataTestRun } from "../../components/DataTestRun";
import { SegmentTestHeader } from "../../components/SegmentTestHeader";
import { useRouteDataTestRun } from "../../hooks/use-route-data-test-run";
import { useRouteSegmentTest } from "../../hooks/use-route-segment-test";

export function SegmentTestRunPage() {
  const { segment, table, test, urls, isLoading, error } =
    useRouteSegmentTest();
  const {
    run,
    isLoading: isLoadingRun,
    error: runError,
  } = useRouteDataTestRun();

  if (
    segment == null ||
    table == null ||
    test == null ||
    urls == null ||
    run == null ||
    isLoading ||
    isLoadingRun ||
    error != null
  ) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={isLoading || isLoadingRun}
          error={error ?? runError}
        />
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
        run={run}
      />
      <DataTestRun testType="segment" testId={test.id} runId={run.id} />
    </PageContainer>
  );
}
