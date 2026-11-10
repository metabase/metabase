import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { DataTestOverview } from "../../components/DataTestOverview";
import { TransformTestHeader } from "../../components/TransformTestHeader";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";

export function TransformTestOverviewPage() {
  const { transform, test, isLoading, error } = useRouteTransformTest();

  if (transform == null || test == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transform-test-overview">
      <TransformTestHeader transform={transform} test={test} />
      <DataTestOverview testType="transform" testId={test.id} />
    </PageContainer>
  );
}
