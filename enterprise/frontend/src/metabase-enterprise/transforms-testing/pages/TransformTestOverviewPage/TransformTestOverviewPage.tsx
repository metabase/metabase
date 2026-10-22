import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { TransformTestHeader } from "../../components/TransformTestHeader";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";

import { TransformTestInputsSection } from "./TransformTestInputsSection";
import { TransformTestOutputSection } from "./TransformTestOutputSection";
import { TransformTestRunSection } from "./TransformTestRunSection";

export function TransformTestOverviewPage() {
  const { transform, test, readOnly, isLoading, error } =
    useRouteTransformTest();

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
      <TransformTestRunSection test={test} readOnly={readOnly} />
      <TransformTestInputsSection inputs={test.inputs} />
      <TransformTestOutputSection
        transform={transform}
        expectations={test.expectations}
      />
    </PageContainer>
  );
}
