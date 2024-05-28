import type { FormikHelpers } from "formik";
import { useCallback, useState } from "react";

import ActionCreator from "metabase/actions/containers/ActionCreator/ActionCreator";
import ActionParametersInputForm, {
  ActionParametersInputModal,
} from "metabase/actions/containers/ActionParametersInputForm";
import { useActionInitialValues } from "metabase/actions/hooks/use-action-initial-values";
import { getFormTitle, isImplicitUpdateAction } from "metabase/actions/utils";
import Modal from "metabase/components/Modal";
import { getDashboardType } from "metabase/dashboard/utils";
import { ActionsApi, PublicApi } from "metabase/services";
import type {
  ActionDashboardCard,
  OnSubmitActionForm,
  Dashboard,
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
    const prefetchDashcardValues =
      getDashboardType(dashboard.id) === "public"
        ? PublicApi.prefetchDashcardValues
        : ActionsApi.prefetchDashcardValues;

    const canPrefetch = Object.keys(dashcardParamValues).length > 0;

    if (!canPrefetch) {
      return {};
    }

    return prefetchDashcardValues({
      dashboardId: dashboard.id,
      dashcardId: dashcard.id,
      parameters: JSON.stringify(dashcardParamValues),
    });
  }, [dashboard.id, dashcard.id, dashcardParamValues]);

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
        {showFormModal && (
          <ActionParametersInputModal
            action={action}
            mappedParameters={mappedParameters}
            initialValues={initialValues}
            prefetchesInitialValues={shouldPrefetch}
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
        )}
        {showEditModal && (
          <Modal
            wide
            data-testid="action-editor-modal"
            onClose={closeEditModal}
          >
            <ActionCreator
              initialAction={action}
              action={action}
              modelId={action.model_id}
              databaseId={action.database_id}
              actionId={action.id}
              onSubmit={onActionEdit}
              onClose={closeEditModal}
            />
          </Modal>
        )}
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
        prefetchesInitialValues={shouldPrefetch}
        onSubmit={onSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </FormWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionVizForm;
