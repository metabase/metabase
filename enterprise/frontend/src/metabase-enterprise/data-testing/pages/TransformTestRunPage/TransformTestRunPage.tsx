import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { DataTestRun } from "../../components/DataTestRun";
import { TransformTestHeader } from "../../components/TransformTestHeader";
import { useRouteDataTestRun } from "../../hooks/use-route-data-test-run";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";

export function TransformTestRunPage() {
  const { transform, test, isLoading, error } = useRouteTransformTest();
  const {
    run,
    isLoading: isLoadingRun,
    error: runError,
  } = useRouteDataTestRun();

  if (
    transform == null ||
    test == null ||
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
    <PageContainer data-testid="transform-test-run">
      <TransformTestHeader transform={transform} test={test} run={run} />
      <DataTestRun testType="transform" testId={test.id} runId={run.id} />
    </PageContainer>
  );
}
