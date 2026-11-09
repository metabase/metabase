import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataTestRunSection } from "../../components/DataTestRunSection";
import { TransformTestHeader } from "../../components/TransformTestHeader";
import { TransformTestRunButton } from "../../components/TransformTestRunButton";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";

import { TransformTestInputsSection } from "./TransformTestInputsSection";
import { TransformTestOutputSection } from "./TransformTestOutputSection";

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
      <DataTestRunSection
        lastRun={test.last_run}
        description={t`Runs the transform on the test data and checks its output. The real tables aren't touched.`}
        runsUrl={Urls.transformTestRuns(test.transform_id, test.id)}
        runButton={
          <TransformTestRunButton
            test={test}
            readOnly={readOnly}
            triggeredFrom="test_overview"
          />
        }
      />
      <TransformTestInputsSection inputs={test.inputs} />
      <TransformTestOutputSection
        transform={transform}
        expectations={test.expectations}
      />
    </PageContainer>
  );
}
