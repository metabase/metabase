import { useMemo } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/common/hooks";
import { RunButton } from "metabase/transforms/components/RunButton";
import type { DataTestType } from "metabase-types/api";

import type { DataTestRunTriggeredFrom } from "../../analytics";
import { getDataTestTypeDefinition } from "../../test-types";
import type { DataTest } from "../../types";
import { getRunDataTestCacheKey, getRunStatusInfo } from "../../utils";

type DataTestRunButtonProps = {
  testType: DataTestType;
  test: DataTest;
  readOnly: boolean;
  triggeredFrom: DataTestRunTriggeredFrom;
};

export function DataTestRunButton({
  testType,
  test,
  readOnly,
  triggeredFrom,
}: DataTestRunButtonProps) {
  const definition = getDataTestTypeDefinition(testType);
  const [runTest, { isLoading }] = definition.useRunTestMutation({
    fixedCacheKey: getRunDataTestCacheKey(testType, test.id),
  });
  const run = useMemo(() => getRunStatusInfo(test.last_run), [test.last_run]);
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    definition.trackManualRun({ testId: test.id, triggeredFrom });
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
