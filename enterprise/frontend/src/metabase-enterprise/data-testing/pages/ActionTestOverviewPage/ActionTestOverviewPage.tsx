import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { ActionTestHeader } from "../../components/ActionTestHeader";
import { DataTestOverview } from "../../components/DataTestOverview";
import { useRouteActionTest } from "../../hooks/use-route-action-test";

export function ActionTestOverviewPage() {
  const { action, test, isLoading, error } = useRouteActionTest();

  if (action == null || test == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-test-overview">
      <ActionTestHeader action={action} test={test} />
      <DataTestOverview testType="action" testId={test.id} />
    </PageContainer>
  );
}
