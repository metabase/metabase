import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { ActionFieldsContent } from "metabase/data-studio/actions/components/ActionFieldsContent";
import { canEditActionQuery } from "metabase/data-studio/actions/utils";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataAppActionHeader } from "../../components/DataAppActionHeader";
import { useRouteDataAppAction } from "../../hooks/use-route-data-app-action";

export function DataAppActionFieldsPage() {
  const { fieldId } = useParams<{ fieldId?: string }>();
  const { app, action, databases, isLoading, error } = useRouteDataAppAction();

  if (isLoading || error != null || app == null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-action-fields" gap="lg" px={0} pb={0}>
      <DataAppActionHeader app={app} action={action} px="3.5rem" />
      <ActionFieldsContent
        action={action}
        fieldId={fieldId}
        canChangeFieldType={canEditActionQuery(action, databases)}
        getFieldsUrl={(fieldId) =>
          Urls.dataStudioDataAppActionFields(app.name, action.id, fieldId)
        }
      />
    </PageContainer>
  );
}
