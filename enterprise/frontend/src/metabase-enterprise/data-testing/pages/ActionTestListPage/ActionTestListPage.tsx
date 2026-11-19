import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { ActionHeader } from "metabase/data-studio/actions/components/ActionHeader";
import { useRouteAction } from "metabase/data-studio/actions/hooks/use-route-action";
import { Center } from "metabase/ui";

import { DataTestList } from "../../components/DataTestList";

export function ActionTestListPage() {
  const { action, isLoading, error } = useRouteAction();

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-test-list">
      <ActionHeader action={action} />
      <DataTestList testType="action" subjectId={action.id} />
    </PageContainer>
  );
}
