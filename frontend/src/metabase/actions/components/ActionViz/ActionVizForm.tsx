import { useRef, useState } from "react";

import { getFormTitle } from "metabase/actions/utils";

import type {
  ActionDashboardCard,
  OnSubmitActionForm,
  Dashboard,
  ParametersForActionExecution,
  VisualizationSettings,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import ActionCreator from "metabase/actions/containers/ActionCreator/ActionCreator";
import Modal from "metabase/components/Modal";
import { ActionFormRefData } from "metabase/actions/components/ActionForm/ActionForm";
import ActionParametersInputForm, {
  ActionParametersInputModal,
} from "../../containers/ActionParametersInputForm";
import ActionButtonView from "./ActionButtonView";
import { shouldShowConfirmation } from "./utils";

import { FormWrapper, FormTitle } from "./ActionForm.styled";

interface ActionFormProps {
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

  const formRef = useRef<ActionFormRefData>(null);
  const [formStoredValues, setFormStoredValues] = useState<
    ParametersForActionExecution | undefined
  >();

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
    setFormStoredValues(formRef.current?.values);

    setShowEditModal(true);
  };

  const closeEditModal = () => setShowEditModal(false);

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
            ref={formRef}
            action={action}
            dashboard={dashboard}
            dashcard={dashcard}
            mappedParameters={mappedParameters}
            dashcardParamValues={dashcardParamValues}
            initialValues={formStoredValues}
            hasPreservedInitialValues={!!formStoredValues}
            title={title}
            showConfirmMessage={showConfirmMessage}
            confirmMessage={action.visualization_settings?.confirmMessage}
            onActionEdit={canEditAction ? handleActionEdit : undefined}
            onSubmit={onModalSubmit}
            onClose={() => setShowFormModal(false)}
            onCancel={() => setShowFormModal(false)}
          />
        )}
        {showEditModal && (
          <Modal
            wide
            data-testid="action-creator-modal"
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
        dashboard={dashboard}
        dashcard={dashcard}
        mappedParameters={mappedParameters}
        dashcardParamValues={dashcardParamValues}
        initialValues={formRef.current?.values}
        onSubmit={onSubmit}
      />
    </FormWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionVizForm;
