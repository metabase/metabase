import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
    <DataTestRuns
      testType="transform"
      testId={test.id}
      header={<TransformTestHeader transform={transform} test={test} />}
    />
  );
}
