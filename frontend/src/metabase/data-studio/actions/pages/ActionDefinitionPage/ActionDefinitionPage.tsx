import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { findErrorMessage, getErrorMessage } from "metabase/api/utils";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeaderActions } from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { hasNativeWritePermissions } from "metabase/common/utils/database";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { type Location, useLocation, useNavigate } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Database,
  ImplicitActionKind,
  TableId,
  UpdateImplicitActionRequest,
  WritebackImplicitQueryAction,
  WritebackQueryAction,
} from "metabase-types/api";

import { trackDataActionQueryUpdated } from "../../analytics";
import { ActionHeader } from "../../components/ActionHeader";
import { ImplicitActionDefinitionContent } from "../../components/ImplicitActionDefinitionContent";
import { QueryActionDefinitionContent } from "../../components/QueryActionDefinitionContent";
import { QueryActionEditor } from "../../components/QueryActionEditor";
import { QueryActionEditorPane } from "../../components/QueryActionEditorPane";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useQueryActionDraft } from "../../hooks/use-query-action-draft";
import { useRouteAction } from "../../hooks/use-route-action";
import { canEditActionQuery } from "../../utils";

export function ActionDefinitionPage() {
  const { action, isLoading, error } = useRouteAction();

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return action.type === "implicit" ? (
    <ImplicitActionDefinitionPage key={action.id} action={action} />
  ) : (
    <QueryActionDefinitionPage key={action.id} action={action} />
  );
}

type QueryActionDefinitionPageProps = {
  action: WritebackQueryAction;
};

function QueryActionDefinitionPage({ action }: QueryActionDefinitionPageProps) {
  const { pathname } = useLocation();
  const isEditRoute = pathname.endsWith("/edit");
  const { databases, isLoading, error } = useActionDatabases();
  const editableDatabases = useMemo(
    () => databases.filter(hasNativeWritePermissions),
    [databases],
  );

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const canEditQuery = canEditActionQuery(action, databases);

  return isEditRoute && canEditQuery ? (
    <QueryActionEditPage
      key={action.id}
      action={action}
      databases={editableDatabases}
    />
  ) : (
    <QueryActionViewPage
      action={action}
      databases={editableDatabases}
      canEditQuery={canEditQuery}
    />
  );
}

type QueryActionEditPageProps = {
  action: WritebackQueryAction;
  databases: Database[];
};

type QueryActionViewPageProps = QueryActionEditPageProps & {
  canEditQuery: boolean;
};

function QueryActionViewPage({
  action,
  databases,
  canEditQuery,
}: QueryActionViewPageProps) {
  return (
    <PageContainer data-testid="action-definition">
      <ActionHeader action={action} />
      <QueryActionDefinitionContent
        action={action}
        databases={databases}
        canEdit={canEditQuery}
        editUrl={Urls.dataStudioActionEdit(action.id)}
      />
    </PageContainer>
  );
}

function QueryActionEditPage({ action, databases }: QueryActionEditPageProps) {
  const draft = useQueryActionDraft({
    initialDatasetQuery: action.dataset_query,
    formSettings: action.visualization_settings,
  });
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateAction, { isLoading: isSaving }] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const navigate = useNavigate();
  const isSavedRef = useRef(false);
  const isLocationAllowed = useCallback(
    (location?: Location) => !location || isSavedRef.current,
    [],
  );

  const handleSave = async () => {
    if (draft.definition == null) {
      return;
    }
    const { error } = await updateAction({
      id: action.id,
      ...draft.definition,
    });
    if (error) {
      const message = getErrorMessage(error);
      sendErrorToast(
        message
          ? t`Failed to update action: ${message}`
          : t`Failed to update action`,
      );
      return;
    }
    trackDataActionQueryUpdated(action.id);
    sendSuccessToast(t`Action updated`);
    isSavedRef.current = true;
    navigate(Urls.dataStudioAction(action.id));
  };

  return (
    <>
      <PageContainer data-testid="action-query-editor">
        <ActionHeader
          action={action}
          isEditMode
          actions={
            <PaneHeaderActions
              isValid={draft.isValid}
              isDirty={draft.isDirty}
              isSaving={isSaving}
              alwaysVisible
              onSave={handleSave}
              onCancel={() => navigate(Urls.dataStudioAction(action.id))}
            />
          }
        />
        <QueryActionEditorPane>
          <QueryActionEditor
            datasetQuery={draft.datasetQuery}
            uiState={uiState}
            databases={databases}
            onChangeDatasetQuery={draft.setDatasetQuery}
            onChangeUiState={setUiState}
          />
        </QueryActionEditorPane>
      </PageContainer>
      <LeaveRouteConfirmModal
        isEnabled={draft.isDirty}
        isLocationAllowed={isLocationAllowed}
      />
    </>
  );
}

type ImplicitActionDefinitionPageProps = {
  action: WritebackImplicitQueryAction;
};

function ImplicitActionDefinitionPage({
  action,
}: ImplicitActionDefinitionPageProps) {
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast, sendUndoToast } =
    useMetadataToasts();

  const handleUpdate = async (
    changes: Omit<UpdateImplicitActionRequest, "id">,
    previous: Omit<UpdateImplicitActionRequest, "id">,
    message: string,
  ) => {
    const { error } = await updateAction({ id: action.id, ...changes });
    if (error) {
      const errorMessage = findErrorMessage(error);
      sendErrorToast(
        errorMessage
          ? t`Failed to update action: ${errorMessage}`
          : t`Failed to update action`,
      );
      return;
    }
    sendSuccessToast(message, async () => {
      const { error } = await updateAction({ id: action.id, ...previous });
      sendUndoToast(error);
    });
  };

  const handleTableChange = (table_id: TableId) => {
    if (table_id !== action.table_id && action.table_id != null) {
      handleUpdate(
        { table_id },
        { table_id: action.table_id },
        t`Action table updated`,
      );
    }
  };

  const handleKindChange = (kind: ImplicitActionKind) => {
    if (kind !== action.kind) {
      handleUpdate(
        { kind },
        { kind: action.kind },
        t`Action operation updated`,
      );
    }
  };

  return (
    <PageContainer data-testid="action-definition">
      <ActionHeader action={action} />
      <ImplicitActionDefinitionContent
        tableId={action.table_id}
        kind={action.kind}
        readOnly={!action.can_write}
        onChangeTable={handleTableChange}
        onChangeKind={handleKindChange}
      />
    </PageContainer>
  );
}
