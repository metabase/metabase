import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { ActionFieldsContent } from "../../components/ActionFieldsContent";
import { ActionHeader } from "../../components/ActionHeader";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useRouteAction } from "../../hooks/use-route-action";
import { canEditActionQuery } from "../../utils";

export function ActionFieldsPage() {
  const { fieldId } = useParams<{ fieldId?: string }>();
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionDatabases();
  const isLoading = isLoadingAction || isLoadingDatabases;
  const error = actionError ?? databasesError;

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
      <ActionFieldsContent
        action={action}
        fieldId={fieldId}
        canChangeFieldType={canEditActionQuery(action, databases)}
        getFieldsUrl={(fieldId) =>
          Urls.dataStudioActionFields(action.id, fieldId)
        }
      />
    </PageContainer>
  );
}
