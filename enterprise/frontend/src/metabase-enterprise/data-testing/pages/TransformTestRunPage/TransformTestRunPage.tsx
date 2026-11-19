import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataTestRun } from "../../components/DataTestRun";
import { TransformTestHeader } from "../../components/TransformTestHeader";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";

type TransformTestRunRouteParams = {
  runId: string;
};

export function TransformTestRunPage() {
  const { transform, test, isLoading, error } = useRouteTransformTest();
  const params = useParams<TransformTestRunRouteParams>();
  const runId = Urls.extractEntityId(params.runId);

  if (
    transform == null ||
    test == null ||
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
    <PageContainer data-testid="transform-test-run">
      <TransformTestHeader transform={transform} test={test} />
      <DataTestRun testType="transform" testId={test.id} runId={runId} />
    </PageContainer>
  );
}
