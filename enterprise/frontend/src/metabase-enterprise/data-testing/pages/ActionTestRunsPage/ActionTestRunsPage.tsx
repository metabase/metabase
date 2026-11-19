import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { ActionTestHeader } from "../../components/ActionTestHeader";
import { DataTestRuns } from "../../components/DataTestRuns";
import { useRouteActionTest } from "../../hooks/use-route-action-test";

export function ActionTestRunsPage() {
  const { action, test, isLoading, error } = useRouteActionTest();

  if (action == null || test == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-test-runs">
      <ActionTestHeader action={action} test={test} />
      <DataTestRuns testType="action" testId={test.id} />
    </PageContainer>
  );
}
