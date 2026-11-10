import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { DataTestId, DataTestType } from "metabase-types/api";

import { getDataTestTypeDefinition } from "../../test-types";
import { DataTestRunButton } from "../DataTestRunButton";

import { DataTestRunSection } from "./DataTestRunSection";

type DataTestOverviewProps<K extends DataTestType> = {
  testType: K;
  testId: DataTestId;
};

/** The last run of one test, a button to run it, and what the test checks. */
export function DataTestOverview<K extends DataTestType>({
  testType,
  testId,
}: DataTestOverviewProps<K>) {
  const definition = getDataTestTypeDefinition(testType);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = definition.useGetTestQuery(testId);
  const {
    readOnly,
    isLoading: isLoadingReadOnly,
    error: readOnlyError,
  } = definition.useReadOnly(
    test != null ? definition.getSubjectId(test) : skipToken,
  );

  if (test == null || isLoadingTest || isLoadingReadOnly) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoadingTest || isLoadingReadOnly}
        error={testError ?? readOnlyError}
      />
    );
  }

  const { TestDefinition } = definition;

  return (
    <>
      <DataTestRunSection
        lastRun={test.last_run}
        description={definition.getRunDescription()}
        runsUrl={definition.getTestRunsUrl(test)}
        runButton={
          <DataTestRunButton
            testType={testType}
            test={test}
            readOnly={readOnly}
            triggeredFrom="test_overview"
          />
        }
      />
      <TestDefinition test={test} />
    </>
  );
}
