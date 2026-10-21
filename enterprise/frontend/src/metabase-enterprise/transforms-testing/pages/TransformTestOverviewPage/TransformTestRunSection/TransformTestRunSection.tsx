import { t } from "ttag";

import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/common/hooks";
import { RunButton } from "metabase/transforms/components/RunButton";
import { RunStatus } from "metabase/transforms/components/RunStatus";
import { Group } from "metabase/ui";
import { useRunTransformTestMutation } from "metabase-enterprise/api";
import type { TransformTest } from "metabase-types/api";

import { getRunStatusInfo } from "../../../utils";

type TransformTestRunSectionProps = {
  test: TransformTest;
  readOnly: boolean;
};

export function TransformTestRunSection({
  test,
  readOnly,
}: TransformTestRunSectionProps) {
  const run = getRunStatusInfo(test.last_run);

  return (
    <TitleSection
      label={t`Run this test`}
      description={t`Runs the transform on the test data and checks its output. The real tables aren't touched.`}
    >
      <Group p="xl" justify="space-between">
        <RunStatus
          run={run}
          neverRunMessage={t`This test hasn't been run before.`}
        />
        <TransformTestRunButton test={test} readOnly={readOnly} />
      </Group>
    </TitleSection>
  );
}

type TransformTestRunButtonProps = {
  test: TransformTest;
  readOnly: boolean;
};

function TransformTestRunButton({
  test,
  readOnly,
}: TransformTestRunButtonProps) {
  const [runTest, { isLoading }] = useRunTransformTestMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await runTest(test.id);
    if (error) {
      sendErrorToast(t`Failed to run the test`);
    }
  };

  return (
    <RunButton
      id={test.id}
      run={getRunStatusInfo(test.last_run)}
      isLoading={isLoading}
      isDisabled={readOnly}
      onRun={handleRun}
    />
  );
}
