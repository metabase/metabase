import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeaderActions } from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { type Location, useLocation, useNavigate } from "metabase/router";
import { Box, Button, Center, Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database, WritebackQueryAction } from "metabase-types/api";

import { ActionEditor } from "../../components/ActionEditor";
import { ActionEditorPane } from "../../components/ActionEditorPane";
import { ActionHeader } from "../../components/ActionHeader";
import { ActionParametersPreview } from "../../components/ActionParametersPreview";
import { useActionDraft } from "../../hooks/use-action-draft";
import { useActionPermissions } from "../../hooks/use-action-permissions";
import { useRouteAction } from "../../hooks/use-route-action";

export function ActionQueryPage() {
  const { pathname } = useLocation();
  const isEditRoute = pathname.endsWith("/edit");
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    databases,
    readOnly,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionPermissions(action);
  const isLoading = isLoadingAction || isLoadingDatabases;
  const error = actionError ?? databasesError;

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return isEditRoute && !readOnly ? (
    <ActionEditPage key={action.id} action={action} databases={databases} />
  ) : (
    <ActionDefinitionPage
      action={action}
      databases={databases}
      readOnly={readOnly}
    />
  );
}

type ActionPageProps = {
  action: WritebackQueryAction;
  databases: Database[];
  readOnly?: boolean;
};

function ActionDefinitionPage({
  action,
  databases,
  readOnly,
}: ActionPageProps) {
  const [uiState, setUiState] = useState(getInitialUiState);

  return (
    <PageContainer data-testid="action-definition">
      <ActionHeader action={action} readOnly={readOnly} />
      <ActionEditorPane>
        <Flex h="100%">
          <Box flex="2 1 0" miw={0}>
            <ActionEditor
              datasetQuery={action.dataset_query}
              uiState={uiState}
              databases={databases}
              readOnly
              topBarInnerContent={
                !readOnly && (
                  <Button
                    component={Link}
                    to={Urls.dataActionEdit(action.id)}
                    size="sm"
                    style={{ flexShrink: 0 }}
                  >
                    {t`Edit definition`}
                  </Button>
                )
              }
              onChangeDatasetQuery={() => undefined}
              onChangeUiState={setUiState}
            />
          </Box>
          <Box
            w="40%"
            style={{
              borderLeft: "1px solid var(--mb-color-border-neutral)",
              overflow: "auto",
            }}
          >
            <ActionParametersPreview action={action} />
          </Box>
        </Flex>
      </ActionEditorPane>
    </PageContainer>
  );
}

function ActionEditPage({ action, databases }: ActionPageProps) {
  const draft = useActionDraft({
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
    sendSuccessToast(t`Action updated`);
    isSavedRef.current = true;
    navigate(Urls.dataAction(action.id));
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
              onCancel={() => navigate(Urls.dataAction(action.id))}
            />
          }
        />
        <ActionEditorPane>
          <ActionEditor
            datasetQuery={draft.datasetQuery}
            uiState={uiState}
            databases={databases}
            onChangeDatasetQuery={draft.setDatasetQuery}
            onChangeUiState={setUiState}
          />
        </ActionEditorPane>
      </PageContainer>
      <LeaveRouteConfirmModal
        isEnabled={draft.isDirty}
        isLocationAllowed={isLocationAllowed}
      />
    </>
  );
}
