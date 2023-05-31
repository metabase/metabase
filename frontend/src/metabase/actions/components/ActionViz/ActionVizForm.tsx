import React, { useState } from "react";

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
  onSubmit: OnSubmitActionForm;
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
  onSubmit,
}: ActionFormProps) {
  const [showModal, setShowModal] = useState(false);
  const title = getFormTitle(action);

  // only show confirmation if there are no missing parameters
  const showConfirmMessage =
    shouldShowConfirmation(action) && missingParameters.length === 0;

  const onClick = () => {
    setShowModal(true);
  };

  const onModalSubmit = async (params: ParametersForActionExecution) => {
    const result = await onSubmit(params);
    if (result.success) {
      setShowModal(false);
    }
    return result;
  };

  if (shouldDisplayButton) {
    return (
      <>
        <ActionButtonView
          settings={settings}
          isFullHeight={!isSettings}
          focus={isEditingDashcard}
          onClick={onClick}
        />
        {showModal && (
          <ActionParametersInputModal
            action={action}
            dashboard={dashboard}
            dashcard={dashcard}
            mappedParameters={mappedParameters}
            dashcardParamValues={dashcardParamValues}
            title={title}
            showConfirmMessage={showConfirmMessage}
            confirmMessage={action.visualization_settings?.confirmMessage}
            onSubmit={onModalSubmit}
            onClose={() => setShowModal(false)}
            onCancel={() => setShowModal(false)}
          />
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
        onSubmit={onSubmit}
      />
    </FormWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionVizForm;
