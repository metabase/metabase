import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Anchor, Center, FixedSizeIcon, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useRunTransformTestMutation } from "metabase-enterprise/api";
import type { Transform, TransformTest } from "metabase-types/api";

import { DataTestRuns } from "../../components/DataTestRuns";
import { TransformTestHeader } from "../../components/TransformTestHeader";
import { TransformTestRunButton } from "../../components/TransformTestRunButton";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";
import { getRunTransformTestCacheKey } from "../../utils";

export function TransformTestRunsPage() {
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
    <TransformTestRuns transform={transform} test={test} readOnly={readOnly} />
  );
}

type TransformTestRunsProps = {
  transform: Transform;
  test: TransformTest;
  readOnly: boolean;
};

function TransformTestRuns({
  transform,
  test,
  readOnly,
}: TransformTestRunsProps) {
  const [, { isLoading: isRunning }] = useRunTransformTestMutation({
    fixedCacheKey: getRunTransformTestCacheKey(test.id),
  });

  return (
    <DataTestRuns
      testType="transform"
      testId={test.id}
      testName={test.name}
      header={<TransformTestHeader transform={transform} test={test} />}
      subjectLink={<TransformLink transform={transform} />}
      runButton={
        <TransformTestRunButton
          test={test}
          readOnly={readOnly}
          triggeredFrom="test_runs"
        />
      }
      isRunning={isRunning}
      getRunsUrl={(params) =>
        Urls.transformTestRuns(test.transform_id, test.id, params)
      }
    />
  );
}

function TransformLink({ transform }: { transform: Transform }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name="transform" c="core-brand" />
      <Anchor component={ForwardRefLink} to={Urls.transform(transform.id)}>
        {transform.name}
      </Anchor>
    </Group>
  );
}
