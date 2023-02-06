import React, { useState } from "react";

import type {
  WritebackQueryAction,
  WritebackParameter,
  OnSubmitActionForm,
  ActionDashboardCard,
  ParametersForActionExecution,
  VisualizationSettings,
  Dashboard,
} from "metabase-types/api";
import { getFormTitle } from "metabase/actions/utils";

import ActionParametersInputForm, {
  ActionParametersInputModal,
} from "../../containers/ActionParametersInputForm";
import ActionButtonView from "./ActionButtonView";
import { shouldShowConfirmation } from "./utils";

import { FormWrapper, FormTitle } from "./ActionForm.styled";

interface ActionFormProps {
  onSubmit: OnSubmitActionForm;
  dashcard: ActionDashboardCard;
  settings: VisualizationSettings;
  isSettings: boolean;
  dashboard: Dashboard;
  missingParameters: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;
  action: WritebackQueryAction;
  shouldDisplayButton: boolean;
}

function ActionVizForm({
  onSubmit,
  dashcard,
  settings,
  isSettings,
  dashboard,
  missingParameters,
  dashcardParamValues,
  action,
  shouldDisplayButton,
}: ActionFormProps) {
  const [showModal, setShowModal] = useState(false);
  const title = getFormTitle(action);

  // only show confirmation if there are no missing parameters
  const showConfirmMessage =
    shouldShowConfirmation(action) && !missingParameters.length;

  const onClick = () => {
    if (missingParameters.length > 0 || showConfirmMessage) {
      setShowModal(true);
    } else {
      onSubmit({});
    }
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
          onClick={onClick}
          settings={settings}
          isFullHeight={!isSettings}
        />
        {showModal && (
          <ActionParametersInputModal
            onClose={() => setShowModal(false)}
            title={title}
            onSubmit={onModalSubmit}
            showConfirmMessage={!!showConfirmMessage}
            confirmMessage={action.visualization_settings?.confirmMessage}
            dashboard={dashboard}
            dashcard={dashcard}
            missingParameters={missingParameters}
            dashcardParamValues={dashcardParamValues}
            onCancel={() => setShowModal(false)}
            action={action}
          />
        )}
      </>
    );
  }

  return (
    <FormWrapper>
      <FormTitle>{title}</FormTitle>
      <ActionParametersInputForm
        onSubmit={onSubmit}
        dashboard={dashboard}
        dashcard={dashcard}
        missingParameters={missingParameters}
        dashcardParamValues={dashcardParamValues}
        action={action}
      />
    </FormWrapper>
  );
}

export default ActionVizForm;
