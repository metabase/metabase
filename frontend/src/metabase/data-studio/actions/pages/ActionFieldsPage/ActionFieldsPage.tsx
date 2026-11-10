import { match } from "ts-pattern";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  WritebackHttpAction,
  WritebackImplicitQueryAction,
  WritebackQueryAction,
} from "metabase-types/api";

import {
  HttpActionFieldsContent,
  ImplicitActionFieldsContent,
  QueryActionFieldsContent,
} from "../../components/ActionFieldsContent";
import { ActionHeader } from "../../components/ActionHeader";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useRouteAction } from "../../hooks/use-route-action";
import { canEditActionQuery } from "../../utils";

export function ActionFieldsPage() {
  const { fieldId } = useParams<{ fieldId?: string }>();
  const { action, isLoading, error } = useRouteAction();

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return match(action)
    .with({ type: "implicit" }, (action) => (
      <ImplicitActionFieldsPage action={action} fieldId={fieldId} />
    ))
    .with({ type: "query" }, (action) => (
      <QueryActionFieldsPage action={action} fieldId={fieldId} />
    ))
    .with({ type: "http" }, (action) => (
      <HttpActionFieldsPage action={action} fieldId={fieldId} />
    ))
    .exhaustive();
}

type QueryActionFieldsPageProps = {
  action: WritebackQueryAction;
  fieldId: string | undefined;
};

function QueryActionFieldsPage({
  action,
  fieldId,
}: QueryActionFieldsPageProps) {
  const { databases, isLoading, error } = useActionDatabases();

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
      <QueryActionFieldsContent
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

type ImplicitActionFieldsPageProps = {
  action: WritebackImplicitQueryAction;
  fieldId: string | undefined;
};

function ImplicitActionFieldsPage({
  action,
  fieldId,
}: ImplicitActionFieldsPageProps) {
  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
      <ImplicitActionFieldsContent
        action={action}
        fieldId={fieldId}
        getFieldsUrl={(fieldId) =>
          Urls.dataStudioActionFields(action.id, fieldId)
        }
      />
    </PageContainer>
  );
}

type HttpActionFieldsPageProps = {
  action: WritebackHttpAction;
  fieldId: string | undefined;
};

function HttpActionFieldsPage({ action, fieldId }: HttpActionFieldsPageProps) {
  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
      <HttpActionFieldsContent
        action={action}
        fieldId={fieldId}
        getFieldsUrl={(fieldId) =>
          Urls.dataStudioActionFields(action.id, fieldId)
        }
      />
    </PageContainer>
  );
}
