import { useMemo } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/common/hooks";
import { RunButton } from "metabase/transforms/components/RunButton";
import { useRunTransformTestMutation } from "metabase-enterprise/api";
import type { TransformTest } from "metabase-types/api";

import {
  type TransformTestRunTriggeredFrom,
  trackTransformTestTriggerManualRun,
} from "../../analytics";
import { getRunStatusInfo, getRunTransformTestCacheKey } from "../../utils";

type TransformTestRunButtonProps = {
  test: TransformTest;
  readOnly: boolean;
  triggeredFrom: TransformTestRunTriggeredFrom;
};

export function TransformTestRunButton({
  test,
  readOnly,
  triggeredFrom,
}: TransformTestRunButtonProps) {
  const [runTest, { isLoading }] = useRunTransformTestMutation({
    fixedCacheKey: getRunTransformTestCacheKey(test.id),
  });
  const run = useMemo(() => getRunStatusInfo(test.last_run), [test.last_run]);
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    trackTransformTestTriggerManualRun({ testId: test.id, triggeredFrom });
    const { error } = await runTest(test.id);
    if (error) {
      sendErrorToast(t`Failed to run the test`);
    }
  };

  return (
    <RunButton
      id={test.id}
      run={run}
      isLoading={isLoading}
      isDisabled={readOnly}
      onRun={handleRun}
    />
  );
}
