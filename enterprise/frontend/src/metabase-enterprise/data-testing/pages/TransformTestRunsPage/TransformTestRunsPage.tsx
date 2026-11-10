import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { DataTestRuns } from "../../components/DataTestRuns";
import { TransformTestHeader } from "../../components/TransformTestHeader";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";

export function TransformTestRunsPage() {
  const { transform, test, isLoading, error } = useRouteTransformTest();

  if (transform == null || test == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transform-test-runs">
      <TransformTestHeader transform={transform} test={test} />
      <DataTestRuns testType="transform" testId={test.id} />
    </PageContainer>
  );
}
