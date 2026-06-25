import type { FormikHelpers } from "formik";
import { useCallback, useState } from "react";

import ActionCreator from "metabase/actions/containers/ActionCreator/ActionCreator";
import ActionParametersInputForm, {
  ActionParametersInputModal,
} from "metabase/actions/containers/ActionParametersInputForm";
import { useActionInitialValues } from "metabase/actions/hooks/use-action-initial-values";
import { getFormTitle, isImplicitUpdateAction } from "metabase/actions/utils";
import { actionApi, publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { useDispatch } from "metabase/redux";
import { Modal, PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS } from "metabase/ui";
import { getDashboardType } from "metabase/utils/dashboard";
import type {
  ActionDashboardCard,
  Dashboard,
  OnSubmitActionForm,
  ParametersForActionExecution,
  VisualizationSettings,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import ActionButtonView from "./ActionButtonView";
import { FormTitle, FormWrapper } from "./ActionForm.styled";
import { shouldShowConfirmation } from "./utils";

export interface ActionFormProps {
  action: WritebackAction;
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  missingParameters?: WritebackParameter[];
  mappedParameters?: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;
  settings: VisualizationSettings;
  isSettings: boolean;
  shouldDisplayButton: boolean;
  isEditingDashcard: boolean;
  canEditAction: boolean | undefined;
  onSubmit: OnSubmitActionForm;

  onActionEdit?: (newAction: WritebackAction) => void;
}

function ActionVizForm({
  action,
  dashcard,
  dashboard,
  settings,
  missingParameters = [],
  mappedParameters = [],
  dashcardParamValues,
  isSettings,
  shouldDisplayButton,
  isEditingDashcard,
  canEditAction,
  onSubmit,

  onActionEdit,
}: ActionFormProps) {
  const dispatch = useDispatch();
  const [showFormModal, setShowFormModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const title = getFormTitle(action);

  // only show confirmation if there are no missing parameters
  const showConfirmMessage =
    shouldShowConfirmation(action) && missingParameters.length === 0;

  const onClick = () => {
    setShowFormModal(true);
  };

  const onModalSubmit = async (params: ParametersForActionExecution) => {
    const result = await onSubmit(params);
    if (result.success) {
      setShowFormModal(false);
    }
    return result;
  };

  const handleActionEdit = () => {
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
  };

  const fetchInitialValues = useCallback(async () => {
    const canPrefetch = Object.keys(dashcardParamValues).length > 0;

    if (!canPrefetch) {
      return {};
    }

    if (getDashboardType(dashboard.id) === "public") {
      return runRtkEndpoint(
        {
          dashboardId: dashboard.id,
          dashcardId: dashcard.id,
          parameters: JSON.stringify(dashcardParamValues),
        },
        dispatch,
        publicApi.endpoints.prefetchPublicDashcardValues,
      );
    }

    return runRtkEndpoint(
      {
        dashboardId: dashboard.id,
        dashcardId: dashcard.id,
        parameters: dashcardParamValues,
      },
      dispatch,
      actionApi.endpoints.prefetchDashcardValues,
    );
  }, [dashboard.id, dashcard.id, dashcardParamValues, dispatch]);

  const shouldPrefetch = isImplicitUpdateAction(action);

  const { hasPrefetchedValues, initialValues, prefetchValues } =
    useActionInitialValues({
      fetchInitialValues,
      initialValues: dashcardParamValues,
      shouldPrefetch,
    });

  const handleSubmitSuccess = useCallback(
    (actions: FormikHelpers<ParametersForActionExecution>) => {
      if (shouldPrefetch) {
        prefetchValues();
      } else {
        actions.resetForm();
      }
    },
    [shouldPrefetch, prefetchValues],
  );

  if (shouldDisplayButton) {
    return (
      <>
        <ActionButtonView
          settings={settings}
          isFullHeight={!isSettings}
          focus={isEditingDashcard}
          onClick={onClick}
        />
        <ActionParametersInputModal
          opened={showFormModal}
          action={action}
          mappedParameters={mappedParameters}
          initialValues={initialValues}
          title={title}
          showEmptyState={shouldPrefetch && !hasPrefetchedValues}
          showConfirmMessage={showConfirmMessage}
          confirmMessage={action.visualization_settings?.confirmMessage}
          onEdit={canEditAction ? handleActionEdit : undefined}
          onSubmit={onModalSubmit}
          onSubmitSuccess={handleSubmitSuccess}
          onClose={() => setShowFormModal(false)}
          onCancel={() => setShowFormModal(false)}
        />
        <Modal
          {...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS}
          opened={showEditModal}
          data-testid="action-editor-modal"
          onClose={closeEditModal}
          size="95%"
          withCloseButton={false}
          padding={0}
        >
          <ActionCreator
            action={action}
            modelId={action.model_id}
            databaseId={action.database_id}
            actionId={action.id}
            onSubmit={onActionEdit}
            onClose={closeEditModal}
          />
        </Modal>
      </>
    );
  }

  return (
    <FormWrapper>
      <FormTitle>{title}</FormTitle>
      <ActionParametersInputForm
        action={action}
        mappedParameters={mappedParameters}
        initialValues={initialValues}
        onSubmit={onSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </FormWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionVizForm;
